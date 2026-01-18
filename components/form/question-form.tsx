"use client"

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Info, GraduationCap, Plus, Minus, Languages } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { QuestionFormData, InsertedQuestion, QuestionFormProps, PreviewAnswer } from "@/types/question"
import { generateAndDownloadPDF } from "@/components/PDFGenerator"


/**
 * Mảng các loại câu hỏi có sẵn.
 * Cách viết: Sử dụng const assertion (as const) để TypeScript infer type chính xác.
 * Cách làm: Mỗi item có value (key cho state), label (hiển thị), description (mô tả), icon (emoji cho UI).
 * Cách thực hiện: Sử dụng để render danh sách checkbox động.
 */
const availableTypes = [
  { value: "multiple_choice", label: "Trắc nghiệm nhiều lựa chọn", description: "1 đáp án đúng", icon: "📝" },
  { value: "true_false", label: "Đúng/Sai", description: "Câu hỏi nhị phân", icon: "✓" },
  { value: "multiple_select", label: "Chọn nhiều đáp án", description: "Nhiều đáp án đúng", icon: "☑" },
  { value: "open_ended", label: "Tự luận", description: "Câu hỏi mở", icon: "✍" },
] as const

/**
 * Component chính: QuestionForm - Form tạo bài tập câu hỏi với AI.
 * Props: onCancel (callback hủy form), initialData (dữ liệu khởi tạo nếu edit).
 * Cách viết: Sử dụng functional component với hooks (useState, useEffect).
 * Cách làm: Quản lý state phức tạp (formData, typeQuantities, ngôn ngữ, loading, preview).
 * Cách thực hiện: Render form -> Submit gọi API -> Hiển thị preview trong Dialog -> Tùy chọn download PDF.
 */
export default function QuestionForm({ onCancel, initialData }: QuestionFormProps) {
  // Lấy user từ localStorage để lấy userId (mặc định 1 nếu không có).
  // Cách làm: Parse JSON từ string, an toàn với null check.
  const userStr = localStorage.getItem("user")
  const user = userStr ? JSON.parse(userStr) : null
  const userId = user?.id || 1

  // Khởi tạo state cho loại câu hỏi đã chọn và loại chính.
  // Cách viết: Sử dụng initialData để hỗ trợ edit form.
  const initialSelectedTypes = initialData?.selected_types || ["multiple_choice"]
  const initialType = initialData?.type || (initialSelectedTypes.length > 1 ? "mixed" : initialSelectedTypes[0])

  /**
   * State cho số lượng câu hỏi theo từng loại.
   * Cách làm: Khởi tạo từ initialData, mặc định 5 nếu selected, 0 nếu không.
   * Cách thực hiện: Cập nhật khi toggle loại câu hỏi.
   */ 
  const [typeQuantities, setTypeQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    availableTypes.forEach((t) => {
      const fromInitial = initialData?.type_quantities?.[t.value]
      init[t.value] = fromInitial !== undefined ? fromInitial : initialSelectedTypes.includes(t.value) ? 5 : 0
    })
    return init
  })

  // Type cho key của typeQuantities (để TypeScript strict).
  type QuestionTypeKeys = "multiple_choice" | "true_false" | "multiple_select" | "open_ended"

  /**
   * State chính cho form data.
   * Cách viết: Sử dụng Required<QuestionFormData> để đảm bảo tất cả field có giá trị mặc định.
   * Cách làm: Khởi tạo từ initialData, với fallback cho type_quantities.
   * Cách thực hiện: Cập nhật qua handleInputChange, tự động tính num_questions từ typeQuantities.
   */
  const [formData, setFormData] = useState<Required<QuestionFormData>>({
    exercise_name: initialData?.exercise_name || "",
    type: initialType as "multiple_choice" | "open_ended" | "mixed",
    selected_types: initialSelectedTypes as QuestionTypeKeys[],
    lesson_name: initialData?.lesson_name || "",
    num_questions: initialData?.num_questions || 5,
    num_answers: initialData?.num_answers || 4,
    difficulty: initialData?.difficulty || "Medium",
    user_id: initialData?.user_id || userId,
    type_quantities: (() => {
      const init: Record<QuestionTypeKeys, number> = {
        multiple_choice: 5,
        true_false: 5,
        multiple_select: 5,
        open_ended: 5,
      }
      if (initialData?.type_quantities) {
        ;(Object.keys(initialData.type_quantities) as QuestionTypeKeys[]).forEach((key) => {
          if (initialData.type_quantities && initialData.type_quantities[key] != null) {
            init[key] = initialData.type_quantities[key]
          }
        })
      }
      return init
    })(),
  })

  // State cho ngôn ngữ (toggle English/Vietnamese).
  // Cách làm: Ảnh hưởng đến label, placeholder, API endpoint, error messages.
  const [isEnglish, setIsEnglish] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [generatedPreview, setGeneratedPreview] = useState<InsertedQuestion[]>([])
  const [showPreview, setShowPreview] = useState(false)

  // Computed: Kiểm tra có loại multiple_choice không (để hiển thị num_answers).
  const hasMultipleChoice = formData.selected_types.includes("multiple_choice")

  /**
   * Handler cho input change.
   */
  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    const parsedValue = ["num_questions", "num_answers"].includes(name) ? Number.parseInt(value) || 0 : value
    setFormData((prev) => ({ ...prev, [name]: parsedValue }))
  }

  /**
   * Handler toggle loại câu hỏi.
   * Cách làm: Thêm/xóa khỏi selected_types, cập nhật type chính (mixed nếu >1).
   * Cách thực hiện: Đồng bộ với typeQuantities (set 5 nếu mới chọn, 0 nếu bỏ).
   */
  const handleTypeChange = (typeValue: "multiple_choice" | "open_ended" | "true_false" | "multiple_select") => {
    // Kiểm tra loại này đã được chọn chưa (boolean flag để quyết định add/remove).
    const wasSelected = formData.selected_types.includes(typeValue)
    
    // Tạo mảng mới: Nếu đã chọn thì filter bỏ, else thêm vào (immutable update, tránh mutate state trực tiếp).
    const newTypes = wasSelected
      ? formData.selected_types.filter((t) => t !== typeValue)  // Remove: Lọc ra các type khác typeValue.
      : [...formData.selected_types, typeValue]  // Add: Spread + push mới.

    // Logic cho type chính: Nếu >1 loại thì "mixed", else lấy loại đầu (fallback "multiple_choice" nếu empty).
    const newType = newTypes.length > 1 ? "mixed" : newTypes[0] || "multiple_choice"

    // Cập nhật formData immutable: Spread prev, override selected_types và type (cast type để TypeScript happy).
    setFormData((prev) => ({
      ...prev,
      selected_types: newTypes as ("multiple_choice" | "open_ended" | "true_false" | "multiple_select")[],
      type: newType as "multiple_choice" | "open_ended" | "mixed",
    }))

    // Cập nhật typeQuantities riêng: Tạo copy, rồi set quantity dựa trên wasSelected.
    setTypeQuantities((prev) => {
      const newQ = { ...prev }  // Immutable copy.
      if (wasSelected) {
        newQ[typeValue] = 0  // Bỏ chọn: Set quantity = 0 (ẩn controls, tránh tính vào tổng).
      } else {
        if (newQ[typeValue] <= 0) newQ[typeValue] = 5  // Mới chọn: Set mặc định 5 (nếu đã có >0 thì giữ nguyên, nhưng thường là 0).
      }
      return newQ
    })
  }

  /**
   * Tăng số lượng câu hỏi cho loại cụ thể.
   * Cách làm: Giới hạn 1-50, sử dụng Math.min/max.
   */
  const incrementQuantity = (typeValue: string) => {
    setTypeQuantities((prev) => ({
      ...prev,
      [typeValue]: Math.min((prev[typeValue] || 0) + 1, 50),
    }))
  }

  /**
   * Giảm số lượng câu hỏi cho loại cụ thể.
   * Cách làm: Giới hạn tối thiểu 1.
   */
  const decrementQuantity = (typeValue: string) => {
    setTypeQuantities((prev) => ({
      ...prev,
      [typeValue]: Math.max((prev[typeValue] || 0) - 1, 1),
    }))
  }

  /**
   * Handler submit form: Gọi API generate câu hỏi.
   * Cách viết: Async function với try-catch.
   * Cách làm: Validate trước (error messages đa ngôn ngữ), submit data với class_id/book_id mặc định=1.
   * Cách thực hiện: Chọn API dựa trên isEnglish (/api/generate-question-english hoặc /api/generate-questions),
   *                 set preview và show Dialog nếu thành công.
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")

    setIsLoading(true)

    try {
      const submitData: Omit<QuestionFormData, "class_id" | "book_id"> & { class_id: number; book_id: number } = {
        ...formData,
        class_id: 1,
        book_id: 1,
        num_questions: formData.num_questions,
        num_answers: formData.num_answers,
        user_id: userId,
        selected_types: formData.selected_types,
        type_quantities: typeQuantities,
      }

      // Chọn API dựa trên ngôn ngữ
      const apiEndpoint = isEnglish ? "/api/generate-question-english" : "/api/generate-questions"
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || (isEnglish ? "Error generating questions" : "Lỗi khi tạo câu hỏi"))
      }

      const generatedData = await response.json()

      setGeneratedPreview(generatedData.questions || [])
      console.log("Generated Questions:", generatedData.questions)
      setShowPreview(true)
    } catch (err: unknown) {
      setError((err as Error).message || (isEnglish ? "Error generating questions. Please try again." : "Lỗi khi tạo câu hỏi. Vui lòng thử lại."))
    } finally {
      setIsLoading(false)
    }
  }



  /**
   * useEffect: Tự động cập nhật num_questions = tổng typeQuantities của selected_types.
   * Cách làm: Chạy khi selected_types hoặc typeQuantities thay đổi.
   * Cách thực hiện: Tính sum bằng reduce.
   */
  useEffect(() => {
    const totalQuestions = formData.selected_types.reduce((sum, type) => {
      return sum + (typeQuantities[type] || 0)
    }, 0)

    setFormData((prev) => ({ ...prev, num_questions: totalQuestions }))
  }, [formData.selected_types, typeQuantities])

  // Điều chỉnh difficulties dựa trên ngôn ngữ
  // Cách làm: Mảng động để hiển thị label phù hợp.
  const difficulties = isEnglish 
    ? ["Easy", "Medium", "Hard"] 
    : ["Dễ", "Bình thường", "Khó"]

  // Labels động cho một số phần (đa ngôn ngữ)
  // Cách viết: Object hoặc ternary để switch nhanh.
  const exerciseNameLabel = isEnglish ? "Exercise Name *" : "Tên Bài Tập *"
  const lessonNameLabel = isEnglish ? "Lesson Content *" : "Nội Dung Bài Học *"
  const questionTypeLabel = isEnglish ? "Question Types *" : "Loại Câu Hỏi *"
  const totalQuestionsLabel = isEnglish ? "Total Questions" : "Tổng Số Câu Hỏi"
  const difficultyLabel = isEnglish ? "Difficulty *" : "Độ Khó *"
  const numAnswersLabel = isEnglish ? "Number of Answers (for multiple choice) *" : "Số Đáp Án (cho câu trắc nghiệm) *"
  const createButtonText = isEnglish ? "Generate Questions" : "Tạo Câu Hỏi"
  const loadingText = isEnglish ? "Generating..." : "Đang Tạo..."
  const cancelText = isEnglish ? "Cancel" : "Hủy"
  const previewTitle = isEnglish ? "AI Generated Questions" : "Câu hỏi tạo từ AI"
  const noQuestionsText = isEnglish ? "No questions generated." : "Không có câu hỏi nào được generate."
  const sampleAnswerText = isEnglish ? "Sample Answer:" : "Đáp án mẫu:"
  const typeText = isEnglish ? "Type:" : "Loại:"
  const pdfNoAnswerText = isEnglish ? "PDF Without Answers" : "PDF Không Đáp Án"
  const pdfWithAnswerText = isEnglish ? "PDF With Answers & Explanations" : "PDF Có Đáp Án & Giải Thích"

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header: Tiêu đề và mô tả form */}
      <div className="mb-8 border-b border-border pb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              {isEnglish ? "Create New Exercise" : "Tạo Bài Tập Mới"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isEnglish ? "Create exercises automatically with AI for high school students" : "Tạo bài tập tự động bằng AI cho học sinh THPT"}
            </p>
          </div>
        </div>

        {/* Nút toggle ngôn ngữ */}
        {/* Cách làm: Button với icon Languages, variant thay đổi dựa trên state. */}
        <div className="flex justify-end mt-4">
          <Button
            type="button"
            variant={isEnglish ? "default" : "outline"}
            onClick={() => setIsEnglish(!isEnglish)}
            className="flex items-center gap-2"
            disabled={isLoading}
          >
            <Languages className="w-4 h-4" />
            {isEnglish ? "Tiếng Việt" : "English"}
          </Button>
        </div>
      </div>

      {/* Form chính: Các field input */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Field: Tên bài tập */}
        <div className="space-y-2">
          <Label htmlFor="exercise_name" className="text-base font-medium">
            {exerciseNameLabel}
          </Label>
          <Input
            id="exercise_name"
            name="exercise_name"
            placeholder={isEnglish ? "E.g., Passive Voice Exercises" : "VD: Kiểm tra 15 phút - Phương trình bậc 2"}
            value={formData.exercise_name || ""}
            onChange={handleInputChange}
            disabled={isLoading}
            className="h-11"
          />
        </div>

        {/* Field: Nội dung bài học (Textarea với HoverCard tooltip) */}
        <div className="space-y-2">
          <Label htmlFor="lesson_name" className="text-base font-medium flex items-center gap-2">
            {lessonNameLabel}
            <HoverCard>
              <HoverCardTrigger asChild>
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <p className="text-sm">
                  {isEnglish 
                    ? "Describe the lesson content in detail for AI to generate suitable questions. E.g., Passive voice: formation, uses in academic writing..."
                    : "Mô tả chi tiết nội dung bài học để AI tạo câu hỏi phù hợp. VD: Phương trình bậc 2 - Công thức nghiệm, biệt thức delta, điều kiện có nghiệm..."}
                </p>
              </HoverCardContent>
            </HoverCard>
          </Label>
          <Textarea
            id="lesson_name"
            name="lesson_name"
            placeholder={isEnglish 
              ? "E.g., Passive Voice Exercises: Rewrite active sentences, identify errors in passive forms..."
              : "VD: Chương 3 - Phương trình bậc 2: Công thức nghiệm, biệt thức delta, điều kiện có nghiệm..."}
            value={formData.lesson_name || ""}
            onChange={handleInputChange}
            rows={4}
            disabled={isLoading}
            className="resize-none"
          />
        </div>

        {/* Section: Chọn loại câu hỏi (Grid với Checkbox và Quantity controls) */}
        <div className="space-y-4">
          <Label className="text-base font-medium flex items-center gap-2">
            {questionTypeLabel}
            <HoverCard>
              <HoverCardTrigger asChild>
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <p className="text-sm">
                  {isEnglish ? "Select question types to generate. You can mix multiple types in one exercise." : "Chọn các dạng câu hỏi muốn tạo. Bạn có thể kết hợp nhiều loại trong một bài tập."}
                </p>
              </HoverCardContent>
            </HoverCard>
          </Label>

          <div className="grid gap-4">
            {availableTypes.map((type) => {
              const selected = formData.selected_types.includes(type.value)
              const quantity = typeQuantities[type.value] || 0

              return (
                <div
                  key={type.value}
                  className={`border rounded-lg p-4 transition-all ${
                    selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <Checkbox
                      id={type.value}
                      checked={selected}
                      onCheckedChange={() => handleTypeChange(type.value)}
                      disabled={isLoading}
                      className="mt-1"
                    />

                    <div className="flex-1 min-w-0">
                      <label htmlFor={type.value} className="flex items-center gap-2 cursor-pointer">
                        <span className="text-2xl">{type.icon}</span>
                        <div>
                          <div className="font-medium text-foreground">{type.label}</div>
                          <div className="text-sm text-muted-foreground">{type.description}</div>
                        </div>
                      </label>

                      {selected && (
                        <div className="mt-4 flex items-center gap-3">
                          <Label className="text-sm font-medium min-w-fit">
                            {isEnglish ? "Number of questions:" : "Số câu hỏi:"}
                          </Label>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-lg bg-transparent"
                              onClick={() => decrementQuantity(type.value)}
                              disabled={isLoading || quantity <= 1}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>

                            <Input
                              type="number"
                              min={1}
                              max={50}
                              value={quantity}
                              onChange={(e) =>
                                setTypeQuantities((prev) => ({
                                  ...prev,
                                  [type.value]: Math.min(Math.max(Number.parseInt(e.target.value) || 1, 1), 50),
                                }))
                              }
                              className="w-20 h-9 text-center font-medium"
                              disabled={isLoading}
                            />

                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-lg bg-transparent"
                              onClick={() => incrementQuantity(type.value)}
                              disabled={isLoading || quantity >= 50}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>

                            <span className="text-sm text-muted-foreground ml-1">
                              {isEnglish ? "questions" : "câu"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Grid: Tổng câu hỏi (disabled, auto) và Độ khó (select) */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-base font-medium">{totalQuestionsLabel}</Label>
            <div className="relative">
              <Input
                type="number"
                value={formData.num_questions || 0}
                disabled
                className="h-11 bg-muted/30 cursor-not-allowed font-semibold text-lg"
              />
              
            </div>
            <p className="text-xs text-muted-foreground">
              {isEnglish ? "Total questions = sum of selected types" : "Tổng số câu = tổng các loại đã chọn"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="difficulty" className="text-base font-medium flex items-center gap-2">
              {difficultyLabel}
            </Label>
            <select
              id="difficulty"
              name="difficulty"
              value={formData.difficulty || (isEnglish ? "Medium" : "Bình thường")}
              onChange={handleInputChange}
              disabled={isLoading}
              className="w-full h-11 px-3 border border-input rounded-lg bg-background text-foreground font-medium"
            >
              {difficulties.map((diff) => (
                <option key={diff} value={isEnglish ? diff : diff === "Bình thường" ? "Medium" : diff.toLowerCase()}>
                  {diff}
                </option>
              ))}
            </select>
          </div>
        </div>

       
        {/* Error display */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg text-sm font-medium">
            {error}
          </div>
        )}

        {/* Buttons: Cancel và Submit */}
        <div className="flex gap-3 justify-end pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="h-11 px-6 bg-transparent"
          >
            {cancelText}
          </Button>
          <Button type="submit" disabled={isLoading} className="h-11 px-8">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {loadingText}
              </>
            ) : (
              createButtonText
            )}
          </Button>
        </div>
      </form>

      {/* Dialog Preview: Hiển thị câu hỏi generated */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {generatedPreview.length > 0 ? (
              generatedPreview.map((q, index) => (
                <div key={q.id || index} className="p-4 border rounded-lg">
                  <h4 className="font-bold">
                    {q.question_text} {q.emoji}
                  </h4>
                  {/* Render answers: Kiểm tra format linh hoạt từ API */}
                  {Array.isArray(q.answers) && q.answers.length > 0 ? (
                    <ul className="list-disc ml-4 mt-2">
                      {q.answers.map((ans: PreviewAnswer, i: number) => {
                        let answerText =
                          ans.answer_text ||
                          ans.text ||
                          (typeof ans === "string" ? ans : String(ans))

                        // Loại bỏ "(correct)" nếu có
                        answerText = answerText.replace(/\(correct\)/gi, "").trim()
                        
                        const isCorrect =
                          ans.is_correct !== undefined
                            ? ans.is_correct
                            : ans.correct !== undefined
                              ? ans.correct
                              : false
                        return (
                          <li key={ans.id || i} className={isCorrect ? "text-green-600" : ""}>
                            {String.fromCharCode(65 + i)}. {answerText}
                          </li>
                        )
                      })}
                    </ul>
                  ) : q.type_name === "multiple_choice" ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      {isEnglish ? "No detailed answers (check backend)." : "Không có đáp án chi tiết (kiểm tra backend)."}
                    </p>
                  ) : null}
                  {q.model_answer && (
                    <p className="mt-2 italic text-sm">
                      {sampleAnswerText} {q.model_answer}
                    </p>
                  )}
                  {/* <p className="mt-2 italic text-sm">{q.explanation}</p> */}
                  {/* <p className="text-xs text-muted-foreground mt-1">
                    {typeText} {q.type_name || (isEnglish ? "Auto-generated" : "Tự động")}
                  </p> */}
                </div>
              ))
            ) : (
              <p>{noQuestionsText}</p>
            )}
          </div>
          {/* Buttons trong Dialog: Cancel, PDF no answers, PDF with answers */}
          <div className="flex justify-end gap-3 mt-6 flex-wrap">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              {cancelText}
            </Button>

            <Button
              variant="secondary"
              onClick={() =>
                generateAndDownloadPDF(generatedPreview, {
                  exerciseName: formData.exercise_name,
                  lessonName: formData.lesson_name,
                  className: "",
                  bookName: "",
                  filename: `${formData.exercise_name || (isEnglish ? "Exercise" : "Bai-tap")} - ${isEnglish ? "no-answers" : "khong-dap-an"}.pdf`,
                  showAnswers: false,
                  showExplanation: false,
                })
              }
            >
              {pdfNoAnswerText}
            </Button>

            <Button
              onClick={() =>
                generateAndDownloadPDF(generatedPreview, {
                  exerciseName: formData.exercise_name,
                  lessonName: formData.lesson_name,
                  className: "",
                  bookName: "",
                  filename: `${formData.exercise_name || (isEnglish ? "Exercise" : "Bai-tap")} - ${isEnglish ? "with-answers" : "co-dap-an"}.pdf`,
                  showAnswers: true,
                  showExplanation: true,
                })
              }
            >
              {pdfWithAnswerText}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}