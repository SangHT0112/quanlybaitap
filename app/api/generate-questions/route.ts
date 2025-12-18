import { NextRequest, NextResponse } from "next/server";
import type { OkPacket } from "mysql2/promise"; // Giữ để tương thích type, nhưng không dùng

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
  type: 'multiple_choice' | 'open_ended' | 'mixed';
  question_type_id?: number;  // Thêm: Loại chính cho toàn bộ exercise (nếu không mixed)
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
  model_answer?: string; // For open_ended
  answers?: string[]; // For multiple_choice/true_false/multiple_select, with "(correct)" on one or more
  suggested_type?: string;  // Optional: Gợi ý loại từ AI (e.g., "multiple_choice", "true_false", "multiple_select", "open_ended")
}

interface InsertedQuestion extends GeneratedQuestion {
  id: number;
  order_num: number;
  question_type_id: number;  // Thêm: Loại cho từng question
}

interface InsertedExercise extends Exercise {
  questions: InsertedQuestion[];
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBk7twdv6n450gZtjhbNN_ugriuqkut-UE";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.json();
    const {
      exercise_name,
      type: exercise_type,
      selected_types,  // Mới: Array string[] như ['multiple_choice', 'true_false']
      type_quantities,  // MỚI: Record<string, number> như { multiple_choice: 5, true_false: 3 }
      lesson_name,
      num_questions,
      num_answers,
      difficulty = 'Medium',
      user_id,
    } = formData as {
      exercise_name: string;
      type: 'multiple_choice' | 'open_ended' | 'mixed';
      selected_types?: string[];  // Mới: Các loại được chọn
      type_quantities?: Record<string, number>;  // MỚI: Số lượng cụ thể cho từng loại
      lesson_name: string;
      num_questions: number;
      num_answers?: number;
      difficulty?: string;
      user_id: number;
    };

    // Validation (giữ nguyên)
    if (!user_id) return NextResponse.json({ error: "Thiếu user_id" }, { status: 400 });
    if (!exercise_name?.trim()) return NextResponse.json({ error: "Vui lòng nhập tên bài tập" }, { status: 400 });
    if (!['multiple_choice', 'open_ended', 'mixed'].includes(exercise_type)) return NextResponse.json({ error: "Loại bài tập không hợp lệ" }, { status: 400 });
    if (!lesson_name?.trim()) return NextResponse.json({ error: "Vui lòng nhập tên bài học" }, { status: 400 });
    if (!num_questions || num_questions < 1 || num_questions > 50) return NextResponse.json({ error: "Số câu hỏi phải từ 1-50" }, { status: 400 });
    if ((selected_types && selected_types.length === 0) || (!selected_types && !type_quantities)) return NextResponse.json({ error: "Phải chọn ít nhất 1 loại câu hỏi" }, { status: 400 });
    if (selected_types?.includes('multiple_choice') && (!num_answers || num_answers < 2 || num_answers > 5)) return NextResponse.json({ error: "Số đáp án phải từ 2-5" }, { status: 400 });

    // MỚI: Xử lý typesToUse và typeDistribution từ type_quantities nếu có (ưu tiên), fallback về selected_types even distribution
    let typesToUse: string[];
    let typeDistribution: { type: string; count: number }[];
    
    if (type_quantities) {
      // Lấy keys có count > 0 làm typesToUse, và distribution từ type_quantities
      const validEntries = Object.entries(type_quantities).filter(([_, count]) => count > 0);
      typesToUse = validEntries.map(([type]) => type);
      typeDistribution = validEntries.map(([type, count]) => ({ type, count }));
      
      // Validate tổng sum == num_questions
      const totalFromQuantities = typeDistribution.reduce((sum, { count }) => sum + count, 0);
      if (totalFromQuantities !== num_questions) {
        return NextResponse.json({ error: `Tổng số lượng từ type_quantities (${totalFromQuantities}) không khớp với num_questions (${num_questions})` }, { status: 400 });
      }
    } else {
      // Fallback selected_types nếu không có (cho backward compat)
      typesToUse = selected_types || (exercise_type === 'multiple_choice' ? ['multiple_choice'] : exercise_type === 'open_ended' ? ['open_ended'] : ['multiple_choice']);
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
    const isMultipleOnly = !isMixed && typesToUse[0] === 'multiple_choice';

    // MỚI: Hardcode existingTypes vì không dùng DB (có thể mở rộng sau)
    const existingTypes: QuestionType[] = [
      { id: 1, type_name: 'multiple choice', icon: '🔢', description: 'Trắc nghiệm nhiều lựa chọn', is_multiple_choice: true },
      { id: 2, type_name: 'true false', icon: '✅', description: 'Đúng/Sai', is_multiple_choice: true },
      { id: 3, type_name: 'multiple select', icon: '📝', description: 'Chọn nhiều đáp án đúng', is_multiple_choice: true },
      { id: 4, type_name: 'open ended', icon: '❓', description: 'Câu hỏi tự luận mở', is_multiple_choice: false },
    ];

    // Determine main question_type_id (FIX: Cho mixed, fallback đến multiple_choice ID thay vì null)
    let questionTypeId: number | null = null;
    if (!isMixed) {
      const matchedType = existingTypes.find(t => t.type_name.toLowerCase() === typesToUse[0].replace('_', ' '));
      if (matchedType) {
        questionTypeId = matchedType.id;
      } else {
        // Insert new nếu không match (giả, không thực insert)
        const isMulti = typesToUse[0] === 'multiple_choice';
        const fakeInsertId = existingTypes.length + 1;
        questionTypeId = fakeInsertId;
        existingTypes.push({ id: fakeInsertId, type_name: typesToUse[0].replace('_', ' '), is_multiple_choice: isMulti });
      }
    } else {
      // FIX cho mixed: Fallback đến ID của 'multiple_choice' (luôn tồn tại)
      const defaultMultiType = existingTypes.find(t => t.type_name.toLowerCase() === 'multiple choice');
      questionTypeId = defaultMultiType?.id || existingTypes[0]?.id || 1;  // Đảm bảo >0
      console.log("🔄 Mixed fallback questionTypeId:", questionTypeId);
    }

    // Bỏ transaction và insert exercise (giả tạo exercise_id)
    const exercise_id = Date.now(); // Fake ID từ timestamp
    console.log("Exercise ID giả:", exercise_id);

    const insertedExercise: Exercise = {
      id: exercise_id,
      name: exercise_name,
      lesson_name,
      type: exercise_type,
      question_type_id: questionTypeId ?? undefined,
      num_questions,
      ...(isMultipleOnly && { num_answers }),
      difficulty,
      user_id,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };

    // Generate questions (giữ nguyên toàn bộ phần này, không thay đổi)
    const levelDescription = 'học sinh cấp 3, ngôn ngữ học thuật phù hợp trình độ THPT';
    const subjectHint = lesson_name.toLowerCase().includes('toán') ? 'Toán học' : lesson_name.toLowerCase().includes('tiếng việt') ? 'Tiếng Việt' : 'Kiến thức chung';
    const typeList = existingTypes.map(t => `${t.id}: ${t.type_name}`).join('; ');
    const typesStr = typesToUse.join(', ');  // e.g., "multiple_choice, true_false"

    // MỚI: Chỉnh prompt để yêu cầu thứ tự rõ ràng theo distribution (với cumulative ranges)
    const orderedTypePrompt = isMixed 
      ? (() => {
          let cumulativeStart = 1;
          return `theo đúng thứ tự và số lượng: ${distributionStr}. Đặt suggested_type tương ứng cho từng nhóm câu hỏi (ví dụ: câu ${cumulativeStart}-${cumulativeStart + typeDistribution[0].count - 1}: "${typeDistribution[0].type}", ` + 
                 typeDistribution.slice(1).map(({ type, count }) => {
                   const end = cumulativeStart + count - 1;
                   const range = `${cumulativeStart}-${end}`;
                   cumulativeStart = end + 1;
                   return `câu ${range}: "${type}",`;
                 }).join(' ') + `).`;
        })() 
      : '';

    const generatePrompt = `
Trả lời DUY NHẤT bằng một mảng JSON hợp lệ với đúng ${num_questions} objects, KHÔNG thêm bất kỳ text nào khác (không markdown, không giải thích). Nếu không đủ, lặp lại để đủ.

Mỗi object: ${isMultipleOnly ? '{ "question_text": "...", "emoji": "...", "answers": ["...", "... (correct)", ...], "explanation": "...", "suggested_type": "multiple_choice" }' : isMixed ? '{ "question_text": "...", "emoji": "...", "answers"?: ["...", "... (correct)", ...], "model_answer"?: "...", "explanation": "...", "suggested_type": "multiple_choice|true_false|multiple_select|open_ended" }' : '{ "question_text": "...", "emoji": "...", "model_answer": "...", "explanation": "...", "suggested_type": "open_ended" }'}

Tạo ${num_questions} câu hỏi ${isMixed ? `mix các loại từ ${typesStr} ${orderedTypePrompt}` : isMultipleOnly ? 'trắc nghiệm nhiều lựa chọn' : 'tự luận'} NGẮN GỌN cho ${levelDescription} về ${subjectHint} "${lesson_name}". 
YÊU CẦU:
- Ngôn ngữ học thuật, rõ ràng, phù hợp với trình độ học sinh THPT.
- Mỗi câu hỏi chỉ 1-2 câu ngắn (dưới 50 chữ).
- Có emoji phù hợp (ví dụ: 📊, 🔬, 📖...).
- Độ khó: ${difficulty} (${difficulty === 'Easy' ? 'dễ' : difficulty === 'Medium' ? 'trung bình' : 'khó'}).
- ${isMixed ? 
  `- Phân bổ ĐÚNG theo thứ tự và số lượng đã chỉ định ở trên. 
    - multiple_choice: ${num_answers} đáp án ngắn (1-10 chữ), đúng 1 "(correct)".
    - true_false: Đúng 2 đáp án (True/False), 1 "(correct)", suggest "true_false".
    - multiple_select: Nhiều đáp án, mark NHỮNG "(correct)" (>1), suggest "multiple_select".
    - open_ended: Không answers, có "model_answer" ngắn, suggest "open_ended".` : 
  isMultipleOnly ? 
  `- Có khoảng ${num_answers} đáp án ngắn gọn (1-10 chữ). 
    - Nếu đúng/sai đơn giản: suggest "true_false" với đúng 2 đáp án (True/False), 1 "(correct)".
    - Nếu có nhiều đáp án đúng: suggest "multiple_select" và mark NHỮNG "(correct)" trên các đáp án đúng (có thể >1).
    - Còn lại: "multiple_choice" với đúng 1 "(correct)".` : 
  `- Câu hỏi mở, khuyến khích phân tích sâu. Có "model_answer" ngắn gọn làm đáp án mẫu.`}
- Thêm "explanation" giải thích chi tiết, học thuật (dưới 50 chữ).
- Luôn thêm "suggested_type" phù hợp từ danh sách: ${typeList} (chỉ dùng các loại trong ${typesStr} nếu mixed).
`;

    // MỚI: Hàm sort questions theo thứ tự typesToUse dựa trên suggested_type
    function sortQuestionsByTypeOrder(questions: GeneratedQuestion[]): GeneratedQuestion[] {
      if (!isMixed) return questions;  // Không cần sort nếu không mixed

      // Tạo map từ type string đến index trong typeDistribution (thứ tự ưu tiên)
      const typeOrderMap = new Map(typeDistribution.map(({ type }, index) => [type, index]));

      // Sort stable theo index của suggested_type (nếu không match, đẩy về cuối)
      return questions.sort((a, b) => {
        const aOrder = typeOrderMap.get(a.suggested_type || '') ?? typeDistribution.length;
        const bOrder = typeOrderMap.get(b.suggested_type || '') ?? typeDistribution.length;
        return aOrder - bOrder;
      });
    }

    // MỚI: Hàm enforce distribution count (assign suggested_type theo distribution nếu AI không tuân thủ)
    function enforceTypeDistribution(questions: GeneratedQuestion[]): GeneratedQuestion[] {
      if (!isMixed) return questions;

      // Đếm current count theo suggested_type
      const currentCounts = new Map<string, number>();
      typesToUse.forEach(type => currentCounts.set(type, 0));
      questions.forEach(q => {
        if (q.suggested_type && typesToUse.includes(q.suggested_type)) {
          currentCounts.set(q.suggested_type, (currentCounts.get(q.suggested_type) || 0) + 1);
        }
      });

      console.log("📈 Current counts before enforce:", Object.fromEntries(currentCounts));

      // Tìm questions cần reassign (những cái không có suggested_type hoặc excess)
      const questionsToAssign: GeneratedQuestion[] = [];
      questions.forEach(q => {
        if (!q.suggested_type || !typesToUse.includes(q.suggested_type)) {
          questionsToAssign.push(q);
        }
      });

      // Đối với excess: Tìm types có count > required, di chuyển excess sang types thiếu
      typeDistribution.forEach(({ type, count: required }) => {
        const current = currentCounts.get(type) || 0;
        if (current > required) {
          const excess = current - required;
          // Tìm questions có suggested_type này để reassign (ưu tiên những cái cuối trong sort)
          const typeQuestions = questions.filter(q => q.suggested_type === type);
          for (let i = 0; i < excess && i < typeQuestions.length; i++) {
            questionsToAssign.push(typeQuestions[typeQuestions.length - 1 - i]);
          }
          currentCounts.set(type, required);
        }
      });

      // Assign cho questionsToAssign theo thứ tự distribution (lặp lại nếu cần)
      let distIndex = 0;
      questionsToAssign.forEach(q => {
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

    // Robust JSON extraction & repair function (cập nhật để pad theo thứ tự nếu mixed)
    function extractAndRepairJson(text: string): GeneratedQuestion[] {
      // Extract JSON array
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Không tìm thấy mảng JSON");

      let jsonStr = jsonMatch[0];

      // Cut to last complete ]
      const lastBracket = jsonStr.lastIndexOf("]");
      if (lastBracket > 0) jsonStr = jsonStr.substring(0, lastBracket + 1);

      // Try parse raw first (no aggressive replaces)
      try {
        let questions = JSON.parse(jsonStr);
        if (!Array.isArray(questions)) throw new Error("Not array");

        // MỚI: Enforce distribution ngay sau parse
        questions = enforceTypeDistribution(questions);

        // MỚI: Sort theo thứ tự type
        questions = sortQuestionsByTypeOrder(questions);

        // Pad if short (theo thứ tự typesToUse nếu mixed, ưu tiên theo distribution)
        let padIndex = 0;  // Index theo distribution
        while (questions.length < num_questions) {
          const targetType = typeDistribution[padIndex % typeDistribution.length].type;
          const dummyAnswers = targetType === 'true_false' ? ['True', 'False (correct)'] : 
                               targetType === 'multiple_select' ? ['A', 'B (correct)', 'C (correct)'] : 
                               targetType === 'multiple_choice' ? Array(num_answers || 4).fill("Mẫu").map((_, i) => i === 0 ? "Mẫu (correct)" : "Mẫu") :
                               undefined;
          questions.push({
            question_text: `Câu hỏi mẫu ${questions.length + 1}.`,
            emoji: "❓",
            explanation: "Giải thích mẫu.",
            suggested_type: targetType,
            ...(targetType !== 'open_ended' && { answers: dummyAnswers }),
            ...(targetType === 'open_ended' && { model_answer: "Đáp án mẫu." }),
          });
          padIndex++;
          // Enforce lại sau pad
          questions = enforceTypeDistribution(questions);
          // Sort lại
          questions = sortQuestionsByTypeOrder(questions);
        }

        return questions.slice(0, num_questions);  // Trim if extra
      } catch (parseErr) {
        console.error("⚠️ Raw parse failed, applying minimal repairs:", parseErr);
        // Minimal repairs: only trailing commas and unquoted keys (skip single quote fix to avoid breaking inner ')
        let repairedStr = jsonStr
          .replace(/(\r\n|\n|\r)/g, " ")  // Normalize whitespace
          .replace(/,\s*([}\]])/g, "$1")  // Remove trailing commas
          .replace(/:\s*([A-Za-z0-9_]+)\s*(?=[,}])/g, ':"$1"');  // Quote unquoted keys

        // Try parse repaired
        try {
          let questions = JSON.parse(repairedStr);
          if (!Array.isArray(questions)) throw new Error("Not array after repair");

          // MỚI: Enforce distribution
          questions = enforceTypeDistribution(questions);

          // MỚI: Sort theo thứ tự type
          questions = sortQuestionsByTypeOrder(questions);

          // Pad if short (tương tự trên, với thứ tự)
          let padIndex = 0;
          while (questions.length < num_questions) {
            const targetType = typeDistribution[padIndex % typeDistribution.length].type;
            const dummyAnswers = targetType === 'true_false' ? ['True', 'False (correct)'] : 
                                 targetType === 'multiple_select' ? ['A', 'B (correct)', 'C (correct)'] : 
                                 targetType === 'multiple_choice' ? Array(num_answers || 4).fill("Mẫu").map((_, i) => i === 0 ? "Mẫu (correct)" : "Mẫu") :
                                 undefined;
            questions.push({
              question_text: `Câu hỏi mẫu ${questions.length + 1}.`,
              emoji: "❓",
              explanation: "Giải thích mẫu.",
              suggested_type: targetType,
              ...(targetType !== 'open_ended' && { answers: dummyAnswers }),
              ...(targetType === 'open_ended' && { model_answer: "Đáp án mẫu." }),
            });
            padIndex++;
            // Enforce và sort lại
            questions = enforceTypeDistribution(questions);
            questions = sortQuestionsByTypeOrder(questions);
          }

          return questions.slice(0, num_questions);
        } catch (repairErr) {
          console.error("⚠️ Repair failed, attempting manual fix:", repairErr);
          // Manual split & fix objects (sử dụng repairedStr)
          const objMatches = repairedStr.match(/\{[\s\S]*?\}/g) || [];
          const fixedQuestions: GeneratedQuestion[] = [];
          objMatches.slice(0, num_questions).forEach((objStr, i) => {
            try {
              const q = JSON.parse(objStr.replace(/,\s*([}\]])/g, "$1"));
              // Ensure required fields
              q.question_text = q.question_text || `Câu hỏi ${i + 1}`;
              q.emoji = q.emoji || "❓";
              q.explanation = q.explanation || "Giải thích mẫu.";
              q.suggested_type = q.suggested_type || typesToUse[0];
              const st = q.suggested_type;
              if (st !== 'open_ended') {
                const dummyAnswers = st === 'true_false' ? ['True', 'False (correct)'] : 
                                     st === 'multiple_select' ? ['A', 'B (correct)', 'C (correct)'] : 
                                     Array(num_answers || 4).fill("Mẫu").map((_, j) => j === 0 ? "Mẫu (correct)" : "Mẫu");
                q.answers = q.answers || dummyAnswers;
              } else {
                q.model_answer = q.model_answer || "Đáp án mẫu.";
              }
              fixedQuestions.push(q);
            } catch {
              // Fallback dummy (theo thứ tự nếu mixed)
              let dummyType: string;
              if (isMixed) {
                const distIndex = Math.floor(fixedQuestions.length / (num_questions / typeDistribution.length)) % typesToUse.length;
                dummyType = typeDistribution[distIndex].type;
              } else {
                dummyType = typesToUse[0];
              }
              const dummyAnswers = dummyType === 'true_false' ? ['True', 'False (correct)'] : 
                                   dummyType === 'multiple_select' ? ['A', 'B (correct)', 'C (correct)'] : 
                                   dummyType === 'multiple_choice' ? Array(num_answers || 4).fill("Mẫu").map((_, j) => j === 0 ? "Mẫu (correct)" : "Mẫu") :
                                   undefined;
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
          // Enforce distribution
          const enforcedFixed = enforceTypeDistribution(fixedQuestions);
          // Sort
          let sortedFixed = sortQuestionsByTypeOrder(enforcedFixed);
          // Pad if still short (theo thứ tự)
          let padIndex = 0;
          while (sortedFixed.length < num_questions) {
            const targetType = typeDistribution[padIndex % typeDistribution.length].type;
            const dummyAnswers = targetType === 'true_false' ? ['True', 'False (correct)'] : 
                                 targetType === 'multiple_select' ? ['A', 'B (correct)', 'C (correct)'] : 
                                 targetType === 'multiple_choice' ? Array(num_answers || 4).fill("Mẫu").map((_, i) => i === 0 ? "Mẫu (correct)" : "Mẫu") :
                                 undefined;
            sortedFixed.push({
              question_text: `Câu hỏi mẫu ${sortedFixed.length + 1}.`,
              emoji: "❓",
              explanation: "Giải thích mẫu.",
              suggested_type: targetType,
              ...(targetType !== 'open_ended' && { answers: dummyAnswers }),
              ...(targetType === 'open_ended' && { model_answer: "Đáp án mẫu." }),
            });
            padIndex++;
            // Enforce và sort lại
            sortedFixed = enforceTypeDistribution(sortedFixed);
            sortedFixed = sortQuestionsByTypeOrder(sortedFixed);
          }
          return sortedFixed;
        }
      }
    }

    let questions: GeneratedQuestion[] = [];
    let retryCount = 0;
    const maxRetries = 2;
    let genText = "";

    while (retryCount <= maxRetries) {
      const generateRes = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: generatePrompt }] }],
          generationConfig: {
            temperature: difficulty === 'Hard' ? 0.8 : difficulty === 'Easy' ? 0.4 : 0.6,
            maxOutputTokens: 4000,  // Tăng để tránh truncate
          },
        }),
      });

      if (!generateRes.ok) {
        const errorData = await generateRes.json();
        throw new Error(`Gemini API failed: ${errorData.error?.message || generateRes.statusText}`);
      }

      const genData = await generateRes.json();
      genText = genData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log("🧠 Gemini raw output:", genText); // debug

      try {
        questions = extractAndRepairJson(genText);
        if (questions.length >= num_questions) break;  // Good enough
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

    // MỚI: Đảm bảo enforce và sort cuối cùng trước khi save
    questions = enforceTypeDistribution(questions);
    questions = sortQuestionsByTypeOrder(questions);

    // Log final distribution để debug
    const finalCounts = new Map<string, number>();
    typesToUse.forEach(type => finalCounts.set(type, 0));
    questions.forEach(q => {
      if (q.suggested_type && typesToUse.includes(q.suggested_type)) {
        finalCounts.set(q.suggested_type, (finalCounts.get(q.suggested_type) || 0) + 1);
      }
    });
    console.log("✅ Final enforced counts:", Object.fromEntries(finalCounts));

    // Save questions to DB -> BỎ, chỉ tạo insertedQuestions với fake IDs
    const insertedQuestions: InsertedQuestion[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      // Determine question_type_id: Use suggested or fallback to typesToUse
      // Tìm multiple_choice type làm default
      const defaultTypeId = existingTypes.find(t => t.type_name.toLowerCase() === 'multiple choice')?.id || 
                          existingTypes[0]?.id || 
                          1;
      
      let qTypeId: number;
    
      // Ưu tiên suggested_type
      if (q.suggested_type) {
          const suggestedType = q.suggested_type ?? '';
          const suggestedMatch = existingTypes.find(t => 
            t.type_name.toLowerCase() === suggestedType.toLowerCase().replace('_', ' ') ||
            t.type_name.toLowerCase() === suggestedType.toLowerCase()
          );
          if (suggestedMatch) {
              qTypeId = suggestedMatch.id;
          } else {
              // Nếu suggested_type không tồn tại trong DB, insert mới (giả)
              const isMulti = ['multiple_choice', 'true_false', 'multiple_select'].includes(q.suggested_type);
              const fakeInsertId = existingTypes.length + 1;
              qTypeId = fakeInsertId;
              existingTypes.push({
                  id: fakeInsertId,
                  type_name: q.suggested_type!,
                  is_multiple_choice: isMulti
              });
          }
      } else {
          // Fallback mới: nếu suggested_type không có, mới dùng exercise.questionTypeId
          qTypeId = questionTypeId!;
      }

      // Fake qid
      const qid = exercise_id + (i + 1); // Simple fake ID
      let correctAnswerIds: number[] = [];  // Để hỗ trợ multiple correct

      // Handle answers nếu là multiple_choice type (hỗ trợ true_false/multiple_select với nhiều correct) - chỉ tạo array, không insert DB
      const qType = existingTypes.find(t => t.id === qTypeId);
      if (qType?.is_multiple_choice && q.answers && q.answers.length > 0) {
        // Tạo fake answer IDs và map
        for (let j = 0; j < q.answers.length; j++) {
          const answerText = q.answers[j].replace(/\(correct\)/gi, "").trim();
          const isCorrect = q.answers[j].includes("(correct)");  // Kiểm tra từng cái, hỗ trợ nhiều

          const fakeAid = qid * 100 + (j + 1); // Fake ID
          if (isCorrect) {
            correctAnswerIds.push(fakeAid);
            // Không update DB, chỉ giữ logic cho tương thích
            if (correctAnswerIds.length === 1) {
              // Có thể set vào q nếu cần, nhưng không
            } else if (correctAnswerIds.length > 1) {
              // Clear nếu cần
            }
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

    // Bỏ commit/rollback

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