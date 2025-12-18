"use client"

import { useState, useEffect, FormEvent, ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Info, Check } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Checkbox } from "@/components/ui/checkbox" 
import type { QuestionFormData, InsertedQuestion, QuestionFormProps, Question } from "@/types/question" // Import all from types
import { generateAndDownloadPDF } from '@/components/PDFGenerator';

// Define a simple Answer type to replace 'any' (align with updated Answer interface)
interface PreviewAnswer {
  id?: number;
  answer_text?: string;
  text?: string;
  is_correct?: boolean;
  correct?: boolean;
}


// Available question types for selection
const availableTypes = [
  { value: 'multiple_choice', label: 'Trắc nghiệm nhiều lựa chọn (1 đáp án đúng)', icon: '🔢' },
  { value: 'true_false', label: 'Đúng/Sai', icon: '✅' },
  { value: 'multiple_select', label: 'Chọn nhiều đáp án đúng', icon: '📝' },
  { value: 'open_ended', label: 'Câu hỏi tự luận mở', icon: '❓' }
] as const;

export default function QuestionForm({ onCancel, initialData }: QuestionFormProps) {
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const userId = user?.id || 1;


  // Compute initial selected_types and type for consistency
  const initialSelectedTypes = initialData?.selected_types || ['multiple_choice'];
  const initialType = initialData?.type || (initialSelectedTypes.length > 1 ? 'mixed' : initialSelectedTypes[0]);
  const [typeQuantities, setTypeQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    availableTypes.forEach(t => {
      const fromInitial = initialData?.type_quantities?.[t.value];
      init[t.value] = fromInitial !== undefined ? fromInitial : (initialSelectedTypes.includes(t.value) ? 1 : 0);
    });
    return init;
  });

  // Cập nhật formData để match API (thêm selected_types array, type giờ là 'mixed' nếu >1 loại)
type QuestionTypeKeys = 'multiple_choice' | 'true_false' | 'multiple_select' | 'open_ended';

const [formData, setFormData] = useState<Required<QuestionFormData>>({
  exercise_name: initialData?.exercise_name || "",
  type: initialType as 'multiple_choice' | 'open_ended' | 'mixed',
  selected_types: initialSelectedTypes as QuestionTypeKeys[],
  lesson_name: initialData?.lesson_name || initialData?.topic || "",
  num_questions: initialData?.num_questions || initialData?.quantity || 1,
  num_answers: initialData?.num_answers || initialData?.number_of_answers || 4,
  difficulty: initialData?.difficulty || "Medium",
  user_id: initialData?.user_id || userId,

  // Legacy fields
  topic: "",
  quantity: 0,
  number_of_answers: 0,
  description: "",
  question_text: "",
  emoji: "",
  question_type: "",
  answers: [],
  explanation: "",

  // ✅ Safe initialization of type_quantities
  type_quantities: (() => {
    const init: Record<QuestionTypeKeys, number> = {
      multiple_choice: 1,
      true_false: 1,
      multiple_select: 1,
      open_ended: 1
    };

    if (initialData?.type_quantities) {
      (Object.keys(initialData.type_quantities) as QuestionTypeKeys[]).forEach((key) => {
        if (initialData.type_quantities && initialData.type_quantities[key] != null) {
          init[key] = initialData.type_quantities[key];
        }
      });
    }

    return init;
  })()
});

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [generatedPreview, setGeneratedPreview] = useState<InsertedQuestion[]>([])
  const [showPreview, setShowPreview] = useState(false)

  // Helper: Kiểm tra nếu có multiple_choice trong selected_types để show num_answers
  const hasMultipleChoice = formData.selected_types.includes('multiple_choice');

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    // Handle number fields
    const parsedValue = ['num_questions', 'num_answers'].includes(name) ? parseInt(value) || 0 : value;
    setFormData((prev) => ({ ...prev, [name]: parsedValue }))
  }

  // Mới: Handle checkbox change for selected_types
  const handleTypeChange = (typeValue: 'multiple_choice' | 'open_ended' | 'true_false' | 'multiple_select') => {
    const wasSelected = formData.selected_types.includes(typeValue);
    const newTypes = wasSelected
      ? formData.selected_types.filter(t => t !== typeValue)
      : [...formData.selected_types, typeValue];
    
    // Update type: 'mixed' nếu >1, else dùng loại đầu tiên
    const newType = newTypes.length > 1 ? 'mixed' : newTypes[0] || 'multiple_choice';
    
    setFormData(prev => ({ 
      ...prev, 
      selected_types: newTypes as ('multiple_choice' | 'open_ended' | 'true_false' | 'multiple_select')[], 
      type: newType as 'multiple_choice' | 'open_ended' | 'mixed'
    }));

    // Separate: Update typeQuantities
    setTypeQuantities(prev => {
      const newQ = { ...prev };
      if (wasSelected) {
        newQ[typeValue] = 0;
      } else {
        if (newQ[typeValue] <= 0) newQ[typeValue] = 1;
      }
      return newQ;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")

    // Validation đơn giản (bỏ class/book, thêm check selected_types)
    if (!formData.exercise_name?.trim()) return setError("Vui lòng nhập tên bài tập")
    if (!formData.lesson_name?.trim()) return setError("Vui lòng nhập tên bài học")
    if ((formData.num_questions || 0) < 1 || (formData.num_questions || 0) > 50) return setError("Số câu hỏi phải từ 1 đến 50")
    if (formData.selected_types.length === 0) return setError("Vui lòng chọn ít nhất 1 loại câu hỏi")
    if (hasMultipleChoice && (!formData.num_answers || formData.num_answers < 2 || formData.num_answers > 5)) {
      return setError("Số đáp án phải từ 2-5 cho trắc nghiệm nhiều lựa chọn")
    }

    setIsLoading(true)

    try {
      // Submit data với defaults (class_id/book_id = 0, gửi selected_types)
      const submitData: Omit<QuestionFormData, 'class_id' | 'book_id'> & { class_id: number; book_id: number } = {
        ...formData,
        class_id: 1,  // Default
        book_id: 1,   // Default
        num_questions: formData.num_questions,
        num_answers: formData.num_answers,
        user_id: userId,
        selected_types: formData.selected_types,  // Mới: Gửi array
        type_quantities: typeQuantities,  // MỚI: Gửi quantities cụ thể cho từng loại (chỉ keys có >0, nhưng backend sẽ filter)
      };
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Lỗi khi tạo câu hỏi")
      }

      const generatedData = await response.json()  // Full InsertedExercise { ..., questions: InsertedQuestion[] }
      
      setGeneratedPreview(generatedData.questions || [])  // Lấy questions array
      console.log("Generated Questions:", generatedData.questions);
      setShowPreview(true)
    } catch (err: unknown) {
      setError((err as Error).message || "Lỗi khi tạo câu hỏi. Vui lòng thử lại.")
    } finally {
      setIsLoading(false)
    }
  }

const confirmSave = () => {
  // Map InsertedQuestion[] to Question[] để match onSubmit type
  const mappedQuestions: Question[] = generatedPreview.map(q => ({
    id: q.id,
    question_text: q.question_text,
    emoji: q.emoji || '',
    question_type: q.type_name || 'Auto-generated',
    answers: q.answers || [],
    explanation: q.explanation || '',
  }));

  // Gọi onSubmit với array questions (đã persisted ở backend)
  setGeneratedPreview([]);
  setShowPreview(false);

  // Reset form (reset selected_types và type_quantities về default)
  setFormData({
    exercise_name: "",
    type: "multiple_choice",  // Fixed: consistent with selected_types length=1
    selected_types: ['multiple_choice'],
    lesson_name: "",
    num_questions: 1,
    num_answers: 4,
    difficulty: "Medium",
    user_id: userId,
    // Legacy fields
    topic: "",
    quantity: 0,
    number_of_answers: 0,
    description: "",
    question_text: "",
    emoji: "",
    question_type: "",
    answers: [],
    explanation: "",

    // ✅ Reset type_quantities về mặc định 1 câu cho mỗi loại
    type_quantities: {
      multiple_choice: 1,
      true_false: 1,
      multiple_select: 1,
      open_ended: 1
    }
  });
}

  useEffect(() => {
    // Chỉ tính tổng cho các loại đang được chọn
    const totalQuestions = formData.selected_types.reduce((sum, type) => {
      return sum + (typeQuantities[type] || 0);
    }, 0);

    setFormData(prev => ({ ...prev, num_questions: totalQuestions }));
  }, [formData.selected_types, typeQuantities]);

  const difficulties = ["Easy", "Medium", "Hard"];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tên bài tập */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Tên Bài Tập <span className="text-red-500">*</span>
        </label>
        <Input
          name="exercise_name"
          placeholder="Ví dụ: Bài tập Toán vui lớp 1"
          value={formData.exercise_name || ''}
          onChange={handleInputChange}
          disabled={isLoading}
        />
      </div>

      {/* Tên bài học (topic) */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Tên Bài Học <span className="text-red-500">*</span>
          <HoverCard>
            <HoverCardTrigger><Info className="w-4 h-4 ml-1 inline" /></HoverCardTrigger>
            <HoverCardContent>Mô tả chi tiết bài học để AI generate phù hợp. Ví dụ: Cộng trừ trong phạm vi 10 cho Toán lớp 1.</HoverCardContent>
          </HoverCard>
        </label>
        <Textarea
          name="lesson_name"
          placeholder="Ví dụ: Bài 1: Giới thiệu số học..."
          value={formData.lesson_name || ''}
          onChange={handleInputChange}
          rows={3}
          disabled={isLoading}
        />
      </div>

      {/* Mới: Chọn loại câu hỏi (checkboxes cho mix) */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Loại Câu Hỏi <span className="text-red-500">*</span>
          <HoverCard>
            <HoverCardTrigger><Info className="w-4 h-4 ml-1 inline" /></HoverCardTrigger>
            <HoverCardContent>Chọn các loại để mix trong bộ đề. AI sẽ phân bổ đều nếu chọn nhiều loại.</HoverCardContent>
          </HoverCard>
        </label>
        <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-muted/50">
         {availableTypes.map((type) => {
            const selected = formData.selected_types.includes(type.value);
            return (
              <div key={type.value} className="flex items-center space-x-2">
                <Checkbox
                  id={type.value}
                  checked={selected}
                  onCheckedChange={() => handleTypeChange(type.value)}
                  disabled={isLoading}
                />
                <label htmlFor={type.value} className="text-sm flex items-center">
                  <span className="mr-1">{type.icon}</span>
                  {type.label}
                </label>

                {selected && (
                  <>
                   <Input
                      type="number"
                      min={1}
                      max={50}
                      value={typeQuantities[type.value]}
                      onChange={(e) =>
                        setTypeQuantities(prev => ({
                          ...prev,
                          [type.value]: parseInt(e.target.value) || 1
                        }))
                      }
                      className="w-16 ml-2"
                      disabled={isLoading}
                    />

                    <span className="ml-1 text-sm text-muted-foreground">câu</span>
                  </>
                )}
              </div>
            );
          })}


        </div>
        {formData.selected_types.length > 1 && (
          <p className="text-xs text-muted-foreground mt-1">Đã chọn mix: {formData.selected_types.join(', ')} (AI sẽ mix đều)</p>
        )}
      </div>

      {/* Số lượng & độ khó */}
      <div className="grid grid-cols-2 gap-4">
       <div>
        <label className="block text-sm font-medium mb-2">
          Số Lượng Câu Hỏi <span className="text-red-500">*</span>
        </label>
        <Input
          type="number"
          name="num_questions"
          value={formData.num_questions || 0}
          disabled
          className="bg-muted/30 cursor-not-allowed"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Tổng số câu hỏi = tổng số câu hỏi của các loại đã chọn
        </p>
      </div>


        <div>
          <label className="block text-sm font-medium mb-2">
            Độ Khó <span className="text-red-500">*</span>
            <HoverCard>
              <HoverCardTrigger><Info className="w-4 h-4 ml-1 inline" /></HoverCardTrigger>
              <HoverCardContent>Easy: Đơn giản cho trẻ nhỏ; Hard: Phức tạp hơn.</HoverCardContent>
            </HoverCard>
          </label>
          <select
            name="difficulty"
            value={formData.difficulty || "Medium"}
            onChange={handleInputChange}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background"
            aria-label="Chọn độ khó"
          >
            {difficulties.map((diff) => (
              <option key={diff} value={diff}>{diff}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Số lượng đáp án (chỉ show nếu có multiple_choice) */}
      {hasMultipleChoice && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Số Lượng Đáp Án (cho trắc nghiệm nhiều lựa chọn) <span className="text-red-500">*</span>
            <HoverCard>
              <HoverCardTrigger><Info className="w-4 h-4 ml-1 inline" /></HoverCardTrigger>
              <HoverCardContent>2-5 options để cân bằng độ khó. Các loại khác sẽ tự động điều chỉnh (ví dụ: True/False = 2).</HoverCardContent>
            </HoverCard>
          </label>
          <Input
            type="number"
            name="num_answers"
            min={2}
            max={5}
            step={1}
            value={formData.num_answers || 4}
            onChange={handleInputChange}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground mt-1">Từ 2 đến 5 đáp án</p>
        </div>
      )}

      {/* Thông báo lỗi */}
      {error && <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>}

      {/* Nút */}
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>Hủy</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang Tạo...</> : "Tạo Câu Hỏi"}
        </Button>
      </div>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Câu Hỏi Đã Generate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {generatedPreview.length > 0 ? (
              generatedPreview.map((q, index) => (
                <div key={q.id || index} className="p-4 border rounded-lg">
                  <h4 className="font-bold">{q.question_text} {q.emoji}</h4>
                  {Array.isArray(q.answers) && q.answers.length > 0 ? (
                    <ul className="list-disc ml-4 mt-2">
                   {q.answers.map((ans: PreviewAnswer, i: number) => {
                        // Robust handling for different possible shapes of 'ans' (e.g., {answer_text, is_correct}, {text, correct}, plain string, etc.)
                        const answerText = ans.answer_text || ans.text || (typeof ans === 'string' ? ans : String(ans));
                        const isCorrect = ans.is_correct !== undefined ? ans.is_correct : (ans.correct !== undefined ? ans.correct : false);
                        return (
                          <li key={ans.id || i} className={isCorrect ? "text-green-600" : ""}>
                            {String.fromCharCode(65 + i)}. {answerText}
                          </li>
                        );
                      })}
                    </ul>
                  ) : q.type_name === 'multiple_choice' ? (
                    <p className="text-sm text-muted-foreground mt-2">Không có đáp án chi tiết (kiểm tra backend).</p>
                  ) : null}
                  {q.model_answer && <p className="mt-2 italic text-sm">Đáp án mẫu: {q.model_answer}</p>}
                  <p className="mt-2 italic text-sm">{q.explanation}</p>
                  <p className="text-xs text-muted-foreground mt-1">Loại: {q.type_name || 'Tự động'}</p>
                </div>
              ))
            ) : (
              <p>Không có câu hỏi nào được generate.</p>
            )}
          </div>
         <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowPreview(false)}>Hủy</Button>
            <Button onClick={() => 
              generateAndDownloadPDF(generatedPreview, {
                exerciseName: formData.exercise_name,
                lessonName: formData.lesson_name,
                className: "",  // Default empty
                bookName: ""    // Default empty
              })
            }>
              Tải PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  )
}