import { NextRequest, NextResponse } from "next/server";
import type { OkPacket } from "mysql2/promise"; // Giữ để tương thích type, nhưng không dùng
import { setTimeout } from 'timers/promises'; // Thêm: Để backoff nếu cần

interface QuestionType {
  id: number;
  type_name: string;
  icon?: string;
  description?: string;
  is_multiple_choice: boolean;
}

interface Exercise {
  id: number;
  name: string;
  lesson_name: string;
  type: 'multiple_choice' | 'open_ended' | 'mixed' | 'true_false' | 'multiple_select';
  question_type_id?: number;
  num_questions: number;
  num_answers?: number;
  difficulty: string;
  user_id: number;
  created_at: string;
}

interface GeneratedQuestion {
  question_text: string;
  emoji: string;
  explanation: string;
  model_answer?: string;
  answers?: string[];
  suggested_type?: string;
}

interface InsertedQuestion extends GeneratedQuestion {
  id: number;
  order_num: number;
  question_type_id: number;
}

interface InsertedExercise extends Exercise {
  questions: InsertedQuestion[];
}

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent";

// Module-level round-robin index (shared across requests)
let keyIndex = 0;

// Collect keys from env
const geminiKeys: string[] = [];
let i = 1;
while (process.env[`GEMINI_API_KEY_${i}`]) {
  geminiKeys.push(process.env[`GEMINI_API_KEY_${i}`]!);
  i++;
}
if (geminiKeys.length === 0) {
  // Fallback to single key if none numbered
  if (process.env.GEMINI_API_KEY) {
    geminiKeys.push(process.env.GEMINI_API_KEY);
  } else {
    throw new Error("No valid Gemini API key found. Please set GEMINI_API_KEY or GEMINI_API_KEY_1, etc., in environment variables.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.json();
    const {
      exercise_name,
      type: exercise_type,
      selected_types,
      type_quantities,
      lesson_name,
      num_questions,
      num_answers,
      difficulty = 'Medium',
      user_id,
    } = formData as {
      exercise_name: string;
      type: 'multiple_choice' | 'open_ended' | 'mixed' | 'true_false' | 'multiple_select';
      selected_types?: string[];
      type_quantities?: Record<string, number>;
      lesson_name: string;
      num_questions: number;
      num_answers?: number;
      difficulty?: string;
      user_id: number;
    };

    // Validation
    if (!user_id) return NextResponse.json({ error: "Thiếu user_id" }, { status: 400 });
    if (!exercise_name?.trim()) return NextResponse.json({ error: "Vui lòng nhập tên bài tập" }, { status: 400 });
    if (!['multiple_choice', 'open_ended', 'mixed', 'true_false', 'multiple_select'].includes(exercise_type)) {
      return NextResponse.json({ error: "Loại bài tập không hợp lệ" }, { status: 400 });
    }
    if (!lesson_name?.trim()) return NextResponse.json({ error: "Vui lòng nhập tên bài học" }, { status: 400 });
    if (!num_questions || num_questions < 1 || num_questions > 50) return NextResponse.json({ error: "Số câu hỏi phải từ 1-50" }, { status: 400 });
    if ((selected_types && selected_types.length === 0) || (!selected_types && !type_quantities)) return NextResponse.json({ error: "Phải chọn ít nhất 1 loại câu hỏi" }, { status: 400 });

    // Xử lý typesToUse và typeDistribution
    let typesToUse: string[];
    let typeDistribution: { type: string; count: number }[];
   
    if (type_quantities) {
      const validEntries = Object.entries(type_quantities).filter(([_, count]) => count > 0);
      typesToUse = validEntries.map(([type]) => type);
      typeDistribution = validEntries.map(([type, count]) => ({ type, count }));
     
      const totalFromQuantities = typeDistribution.reduce((sum, { count }) => sum + count, 0);
      if (totalFromQuantities !== num_questions) {
        return NextResponse.json({ error: `Tổng số lượng từ type_quantities (${totalFromQuantities}) không khớp với num_questions (${num_questions})` }, { status: 400 });
      }
    } else {
      typesToUse = selected_types || (exercise_type === 'multiple_choice' ? ['multiple_choice'] : 
                                      exercise_type === 'open_ended' ? ['open_ended'] : 
                                      exercise_type === 'true_false' ? ['true_false'] :
                                      exercise_type === 'multiple_select' ? ['multiple_select'] :
                                      ['multiple_choice']);
      const numPerType = Math.floor(num_questions / typesToUse.length);
      const remainder = num_questions % typesToUse.length;
      typeDistribution = typesToUse.map((type, index) => ({
        type,
        count: numPerType + (index < remainder ? 1 : 0),
      }));
    }

    const distributionStr = typeDistribution.map(({ type, count }) => `${count} câu ${type}`).join(', ');
    console.log("📊 Type distribution:", distributionStr);

    const isMixed = typesToUse.length > 1 || exercise_type === 'mixed';
    const choiceBasedTypes = ['multiple_choice', 'true_false', 'multiple_select'];
    const isChoiceBased = !isMixed && choiceBasedTypes.includes(typesToUse[0]);

    // SỬA: Default num_answers cho choice-based nếu không có
    let effectiveNumAnswers = num_answers;
    if (isChoiceBased && !effectiveNumAnswers) effectiveNumAnswers = 4;
    if (typesToUse[0] === 'true_false') effectiveNumAnswers = 2; // Force 2 cho true_false

    // Validation num_answers cho tất cả choice-based
    if (isChoiceBased && (!effectiveNumAnswers || effectiveNumAnswers < 2 || effectiveNumAnswers > 5)) {
      return NextResponse.json({ error: "Số đáp án phải từ 2-5 cho các loại trắc nghiệm" }, { status: 400 });
    }

    const existingTypes: QuestionType[] = [
      { id: 1, type_name: 'multiple choice', icon: '🔢', description: 'Trắc nghiệm nhiều lựa chọn', is_multiple_choice: true },
      { id: 2, type_name: 'true false', icon: '✅', description: 'Đúng/Sai', is_multiple_choice: true },
      { id: 3, type_name: 'multiple select', icon: '📝', description: 'Chọn nhiều đáp án đúng', is_multiple_choice: true },
      { id: 4, type_name: 'open ended', icon: '❓', description: 'Câu hỏi tự luận mở', is_multiple_choice: false },
    ];

    let questionTypeId: number | null = null;
    if (!isMixed) {
      const matchedType = existingTypes.find(t => t.type_name.toLowerCase() === typesToUse[0].replace('_', ' '));
      if (matchedType) {
        questionTypeId = matchedType.id;
      } else {
        const isMulti = choiceBasedTypes.includes(typesToUse[0]);
        const fakeInsertId = existingTypes.length + 1;
        questionTypeId = fakeInsertId;
        existingTypes.push({ id: fakeInsertId, type_name: typesToUse[0].replace('_', ' '), is_multiple_choice: isMulti });
      }
    } else {
      const defaultMultiType = existingTypes.find(t => t.type_name.toLowerCase() === 'multiple choice');
      questionTypeId = defaultMultiType?.id || existingTypes[0]?.id || 1;
      console.log("🔄 Mixed fallback questionTypeId:", questionTypeId);
    }

    const exercise_id = Date.now();
    console.log("Exercise ID giả:", exercise_id);

    const insertedExercise: Exercise = {
      id: exercise_id,
      name: exercise_name,
      lesson_name,
      type: exercise_type,
      question_type_id: questionTypeId ?? undefined,
      num_questions,
      ...(isChoiceBased && { num_answers: effectiveNumAnswers }),
      difficulty,
      user_id,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };

    // Generate prompt
    const levelDescription = 'học sinh cấp 3, ngôn ngữ học thuật phù hợp trình độ THPT';
    const subjectHint = lesson_name.toLowerCase().includes('toán') ? 'Toán học' : lesson_name.toLowerCase().includes('tiếng việt') ? 'Tiếng Việt' : 'Kiến thức chung';
    const typeList = existingTypes.map(t => `${t.id}: ${t.type_name}`).join('; ');
    const typesStr = typesToUse.join(', ');

    // Object structure
    let objectStr: string;
    if (isMixed) {
      objectStr = '{ "question_text": "...", "emoji": "...", "answers"?: ["...", "... (correct)", ...], "model_answer"?: "...", "explanation": "...", "suggested_type": "multiple_choice|true_false|multiple_select|open_ended" }';
    } else if (isChoiceBased) {
      objectStr = `{ "question_text": "...", "emoji": "...", "answers": ["...", "... (correct)", ...], "explanation": "...", "suggested_type": "${typesToUse[0]}" }`;
    } else {
      objectStr = '{ "question_text": "...", "emoji": "...", "model_answer": "...", "explanation": "...", "suggested_type": "open_ended" }';
    }

    // Specific instructions
    let specificReq = '';
    if (isMixed) {
      specificReq = `- Phân bổ ĐÚNG theo số lượng: ${distributionStr}.
    - multiple_choice: ${effectiveNumAnswers || 4} đáp án ngắn, đúng 1 "(correct)".
    - true_false: Đúng 2 đáp án ("Đúng", "Sai"), 1 "(correct)", suggest "true_false".
    - multiple_select: Nhiều đáp án, mark NHỮNG "(correct)" (>1), suggest "multiple_select".
    - open_ended: Không answers, có "model_answer" ngắn, suggest "open_ended".`;
    } else if (isChoiceBased) {
      const type = typesToUse[0];
      if (type === 'true_false') {
        specificReq = `- Đúng 2 đáp án ("Đúng", "Sai"), 1 "(correct)".`;
      } else if (type === 'multiple_select') {
        specificReq = `- ${effectiveNumAnswers} đáp án ngắn, mark NHỮNG "(correct)" (>1).`;
      } else { // multiple_choice
        specificReq = `- ${effectiveNumAnswers} đáp án ngắn, đúng 1 "(correct)".`;
      }
      specificReq = `- Có ${specificReq}`;
    } else {
      specificReq = `- Câu hỏi mở, khuyến khích phân tích sâu. Có "model_answer" ngắn gọn làm đáp án mẫu.`;
    }

    const generatePrompt = `
Trả lời DUY NHẤT bằng một mảng JSON hợp lệ với đúng ${num_questions} objects, KHÔNG thêm bất kỳ text nào khác (không markdown, không giải thích). Nếu không đủ, lặp lại để đủ. Giữ JSON compact, không xuống dòng, explanation <30 chữ, answers <5 chữ mỗi cái.
Mỗi object: ${objectStr}
Tạo ${num_questions} câu hỏi ${isMixed ? `mix các loại từ ${typesStr} (phân bổ theo ${distributionStr})` : isChoiceBased ? `trắc nghiệm ${typesToUse[0].replace('_', ' ')}` : 'tự luận'} NGẮN GỌN cho ${levelDescription} về ${subjectHint} "${lesson_name}".
YÊU CẦU:
- Ngôn ngữ học thuật, rõ ràng, phù hợp với trình độ học sinh THPT.
- Mỗi câu hỏi chỉ 1-2 câu ngắn (dưới 50 chữ).
- Có emoji phù hợp (ví dụ: 📊, 🔬, 📖...).
- Độ khó: ${difficulty} (${difficulty === 'Easy' ? 'dễ' : difficulty === 'Medium' ? 'trung bình' : 'khó'}).
- ${specificReq}
- Thêm "explanation" giải thích chi tiết, học thuật (dưới 30 chữ).
- Luôn thêm "suggested_type" phù hợp từ danh sách: ${typeList} (chỉ dùng các loại trong ${typesStr} nếu mixed).
`;

    // Hàm sort và enforce (giữ nguyên)
    function sortQuestionsByTypeOrder(questions: GeneratedQuestion[]): GeneratedQuestion[] {
      if (!isMixed) return questions;
      const typeOrderMap = new Map(typeDistribution.map(({ type }, index) => [type, index]));
      return questions.sort((a, b) => {
        const aOrder = typeOrderMap.get(a.suggested_type || '') ?? typeDistribution.length;
        const bOrder = typeOrderMap.get(b.suggested_type || '') ?? typeDistribution.length;
        return aOrder - bOrder;
      });
    }

    function enforceTypeDistribution(questions: GeneratedQuestion[]): GeneratedQuestion[] {
      if (!isMixed) return questions;
      const currentCounts = new Map<string, number>();
      typesToUse.forEach(type => currentCounts.set(type, 0));
      questions.forEach((q: GeneratedQuestion) => {
        if (q.suggested_type && typesToUse.includes(q.suggested_type)) {
          currentCounts.set(q.suggested_type, (currentCounts.get(q.suggested_type) || 0) + 1);
        }
      });
      console.log("📈 Current counts before enforce:", Object.fromEntries(currentCounts));
      const questionsToAssign: GeneratedQuestion[] = [];
      questions.forEach((q: GeneratedQuestion) => {
        if (!q.suggested_type || !typesToUse.includes(q.suggested_type)) {
          questionsToAssign.push(q);
        }
      });
      typeDistribution.forEach(({ type, count: required }) => {
        const current = currentCounts.get(type) || 0;
        if (current > required) {
          const excess = current - required;
          const typeQuestions = questions.filter((q: GeneratedQuestion) => q.suggested_type === type);
          for (let i = 0; i < excess && i < typeQuestions.length; i++) {
            questionsToAssign.push(typeQuestions[typeQuestions.length - 1 - i]);
          }
          currentCounts.set(type, required);
        }
      });
      let distIndex = 0;
      questionsToAssign.forEach((q: GeneratedQuestion) => {
        const targetType = typeDistribution[distIndex % typeDistribution.length].type;
        const required = typeDistribution[distIndex % typeDistribution.length].count;
        const current = currentCounts.get(targetType) || 0;
        if (current < required) {
          q.suggested_type = targetType;
          currentCounts.set(targetType, current + 1);
        }
        distIndex++;
      });
      console.log("📈 Final counts after enforce:", Object.fromEntries(currentCounts));
      return questions;
    }

    // Hàm get dummy answers
    function getDummyAnswers(targetType: string, numAns?: number): string[] | undefined {
      const effNum = numAns || 4;
      if (targetType === 'true_false') {
        return ['Đúng', 'Sai (correct)'];
      } else if (targetType === 'multiple_select') {
        const base = ['Sai', 'Đúng (correct)', 'Đúng (correct)', 'Sai'];
        return base.slice(0, effNum).concat(Array(effNum - base.length).fill('Sai'));
      } else if (targetType === 'multiple_choice') {
        return Array(effNum).fill('Mẫu').map((_, i) => i === 0 ? 'Mẫu (correct)' : 'Mẫu');
      }
      return undefined;
    }

    // Extract and repair JSON
    function extractAndRepairJson(text: string): GeneratedQuestion[] {
      if (!text.trim().endsWith(']')) {
        text = text.trim() + ']';
        console.log('🔧 Appended ] to fix truncate');
      }

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Không tìm thấy mảng JSON");
      let jsonStr = jsonMatch[0];

      const lastBracket = jsonStr.lastIndexOf("]");
      if (lastBracket > 0) jsonStr = jsonStr.substring(0, lastBracket + 1);

      try {
        let questions = JSON.parse(jsonStr);
        if (!Array.isArray(questions)) throw new Error("Not array");
        questions = enforceTypeDistribution(questions);
        questions = sortQuestionsByTypeOrder(questions);
        let padIndex = 0;
        while (questions.length < num_questions) {
          const targetType = typeDistribution[padIndex % typeDistribution.length].type;
          const dummyAnswers = getDummyAnswers(targetType, effectiveNumAnswers);
          questions.push({
            question_text: `Câu hỏi mẫu ${questions.length + 1}.`,
            emoji: "❓",
            explanation: "Giải thích mẫu.",
            suggested_type: targetType,
            ...(targetType !== 'open_ended' && { answers: dummyAnswers }),
            ...(targetType === 'open_ended' && { model_answer: "Đáp án mẫu." }),
          });
          padIndex++;
          questions = enforceTypeDistribution(questions);
          questions = sortQuestionsByTypeOrder(questions);
        }

        const realQuestions = questions.filter((q: GeneratedQuestion) => !q.question_text.includes('mẫu') && !q.question_text.includes('tự động fix') && q.question_text.trim().length > 10);
        if (realQuestions.length < num_questions * 0.5) {
          throw new Error("Quá nhiều dummy (output có thể bị truncate), cần retry");
        }

        return questions.slice(0, num_questions);
      } catch (parseErr) {
        console.error("⚠️ Raw parse failed, applying minimal repairs:", parseErr);
        let repairedStr = jsonStr
          .replace(/(\r\n|\n|\r)/g, " ")
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/:\s*([A-Za-z0-9_]+)\s*(?=[,}])/g, ':"$1"');
        try {
          let questions = JSON.parse(repairedStr);
          if (!Array.isArray(questions)) throw new Error("Not array after repair");
          questions = enforceTypeDistribution(questions);
          questions = sortQuestionsByTypeOrder(questions);
          let padIndex = 0;
          while (questions.length < num_questions) {
            const targetType = typeDistribution[padIndex % typeDistribution.length].type;
            const dummyAnswers = getDummyAnswers(targetType, effectiveNumAnswers);
            questions.push({
              question_text: `Câu hỏi mẫu ${questions.length + 1}.`,
              emoji: "❓",
              explanation: "Giải thích mẫu.",
              suggested_type: targetType,
              ...(targetType !== 'open_ended' && { answers: dummyAnswers }),
              ...(targetType === 'open_ended' && { model_answer: "Đáp án mẫu." }),
            });
            padIndex++;
            questions = enforceTypeDistribution(questions);
            questions = sortQuestionsByTypeOrder(questions);
          }

          const realQuestions = questions.filter((q: GeneratedQuestion) => !q.question_text.includes('mẫu') && !q.question_text.includes('tự động fix') && q.question_text.trim().length > 10);
          if (realQuestions.length < num_questions * 0.5) {
            throw new Error("Quá nhiều dummy sau repair, cần retry");
          }

          return questions.slice(0, num_questions);
        } catch (repairErr) {
          console.error("⚠️ Repair failed, attempting manual fix:", repairErr);
          const objMatches = repairedStr.match(/\{[\s\S]*?\}/g) || [];
          const fixedQuestions: GeneratedQuestion[] = [];
          objMatches.slice(0, num_questions).forEach((objStr, i) => {
            try {
              const q: Partial<GeneratedQuestion> = JSON.parse(objStr.replace(/,\s*([}\]])/g, "$1"));
              q.question_text = q.question_text || `Câu hỏi ${i + 1}`;
              q.emoji = q.emoji || "❓";
              q.explanation = q.explanation || "Giải thích mẫu.";
              q.suggested_type = q.suggested_type || typesToUse[0];
              const st = q.suggested_type;
              if (st !== 'open_ended') {
                const dummyAnswers = getDummyAnswers(st, effectiveNumAnswers);
                q.answers = q.answers || dummyAnswers;
              } else {
                q.model_answer = q.model_answer || "Đáp án mẫu.";
              }
              fixedQuestions.push(q as GeneratedQuestion);
            } catch {
              let dummyType: string;
              if (isMixed) {
                const distIndex = Math.floor(fixedQuestions.length / (num_questions / typeDistribution.length)) % typesToUse.length;
                dummyType = typeDistribution[distIndex].type;
              } else {
                dummyType = typesToUse[0];
              }
              const dummyAnswers = getDummyAnswers(dummyType, effectiveNumAnswers);
              fixedQuestions.push({
                question_text: `Câu hỏi ${i + 1} (tự động fix).`,
                emoji: "❓",
                explanation: "Lỗi parse, dùng mẫu.",
                suggested_type: dummyType,
                ...(dummyType !== 'open_ended' && { answers: dummyAnswers }),
                ...(dummyType === 'open_ended' && { model_answer: "Mẫu." }),
              });
            }
          });
          let enforcedFixed = enforceTypeDistribution(fixedQuestions);
          let sortedFixed = sortQuestionsByTypeOrder(enforcedFixed);
          let padIndex = 0;
          while (sortedFixed.length < num_questions) {
            const targetType = typeDistribution[padIndex % typeDistribution.length].type;
            const dummyAnswers = getDummyAnswers(targetType, effectiveNumAnswers);
            sortedFixed.push({
              question_text: `Câu hỏi mẫu ${sortedFixed.length + 1}.`,
              emoji: "❓",
              explanation: "Giải thích mẫu.",
              suggested_type: targetType,
              ...(targetType !== 'open_ended' && { answers: dummyAnswers }),
              ...(targetType === 'open_ended' && { model_answer: "Đáp án mẫu." }),
            });
            padIndex++;
            sortedFixed = enforceTypeDistribution(sortedFixed);
            sortedFixed = sortQuestionsByTypeOrder(sortedFixed);
          }

          const realQuestions = sortedFixed.filter((q: GeneratedQuestion) => !q.question_text.includes('mẫu') && !q.question_text.includes('tự động fix') && q.question_text.trim().length > 10);
          if (realQuestions.length < num_questions * 0.5) {
            throw new Error("Quá nhiều dummy sau manual fix, cần retry");
          }

          return sortedFixed;
        }
      }
    }

    let questions: GeneratedQuestion[] = [];
    let retryCount = 0;
    const maxRetries = 3;
    let genText = "";

    while (retryCount <= maxRetries) {
      const currentKeyIndex = keyIndex % geminiKeys.length;
      const currentKey = geminiKeys[currentKeyIndex];
      keyIndex++;
      console.log(`🔑 Using key index ${currentKeyIndex} for attempt ${retryCount + 1}`);

      const generateRes = await fetch(`${GEMINI_API_URL}?key=${currentKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: generatePrompt }] }],
          generationConfig: {
            temperature: difficulty === 'Hard' ? 0.8 : difficulty === 'Easy' ? 0.4 : 0.6,
            maxOutputTokens: 8000,
          },
        }),
      });

      if (!generateRes.ok) {
        const errorData = await generateRes.json();
        const errorMsg = errorData.error?.message || generateRes.statusText;
        const status = generateRes.status;
        if (status === 503 || errorMsg.toLowerCase().includes('overloaded')) {
          console.warn(`⚠️ Model overloaded (503) with key ${currentKeyIndex}. Switching to next key immediately (no backoff). Attempt ${retryCount + 1}/${maxRetries + 1}`);
          retryCount++;
          if (retryCount > maxRetries) {
            throw new Error(`All keys failed due to overload: ${errorMsg}. Please try again later or add more keys.`);
          }
          continue;
        }
        const backoffDelay = Math.pow(2, retryCount) * 1000;
        console.warn(`⚠️ API error (${status}): ${errorMsg}. Retrying with next key in ${backoffDelay}ms... Attempt ${retryCount + 1}/${maxRetries + 1}`);
        await setTimeout(backoffDelay);
        retryCount++;
        if (retryCount > maxRetries) throw new Error(`Gemini API failed after retries: ${errorMsg}`);
        continue;
      }

      const genData = await generateRes.json();
      genText = genData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log("🧠 Gemini raw output:", genText);

      try {
        questions = extractAndRepairJson(genText);
        if (questions.length >= num_questions) break;
        throw new Error("Not enough questions");
      } catch (e) {
        retryCount++;
        console.warn(`⚠️ Retry ${retryCount}/${maxRetries}:`, e);
        if (retryCount > maxRetries) throw e;
      }
    }

    if (questions.length !== num_questions) {
      console.warn(`⚠️ Still ${questions.length} questions after retries, proceeding...`);
    }

    questions = enforceTypeDistribution(questions);
    questions = sortQuestionsByTypeOrder(questions);

    const finalCounts = new Map<string, number>();
    typesToUse.forEach(type => finalCounts.set(type, 0));
    questions.forEach((q: GeneratedQuestion) => {
      if (q.suggested_type && typesToUse.includes(q.suggested_type)) {
        finalCounts.set(q.suggested_type, (finalCounts.get(q.suggested_type) || 0) + 1);
      }
    });
    console.log("✅ Final enforced counts:", Object.fromEntries(finalCounts));

    const insertedQuestions: InsertedQuestion[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      let qTypeId: number;
   
      if (q.suggested_type) {
          const suggestedType = q.suggested_type ?? '';
          const suggestedMatch = existingTypes.find(t =>
            t.type_name.toLowerCase() === suggestedType.toLowerCase().replace('_', ' ') ||
            t.type_name.toLowerCase() === suggestedType.toLowerCase()
          );
          if (suggestedMatch) {
              qTypeId = suggestedMatch.id;
          } else {
              const isMulti = choiceBasedTypes.includes(q.suggested_type);
              const fakeInsertId = existingTypes.length + 1;
              qTypeId = fakeInsertId;
              existingTypes.push({
                  id: fakeInsertId,
                  type_name: q.suggested_type!,
                  is_multiple_choice: isMulti
              });
          }
      } else {
          qTypeId = questionTypeId!;
      }

      const qid = exercise_id + (i + 1);
      let correctAnswerIds: number[] = [];
      const qType = existingTypes.find(t => t.id === qTypeId);
      if (qType?.is_multiple_choice && q.answers && q.answers.length > 0) {
        for (let j = 0; j < q.answers.length; j++) {
          const answerText = q.answers[j].replace(/\(correct\)/gi, "").trim();
          const isCorrect = q.answers[j].includes("(correct)");
          const fakeAid = qid * 100 + (j + 1);
          if (isCorrect) {
            correctAnswerIds.push(fakeAid);
          }
        }
      }

      insertedQuestions.push({
        ...q,
        id: qid,
        order_num: i + 1,
        question_type_id: qTypeId,
      });
    }

    const response: InsertedExercise = {
      ...insertedExercise,
      questions: insertedQuestions,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}