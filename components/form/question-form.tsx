"use client"

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Info, GraduationCap, Plus, Minus } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { QuestionFormData, InsertedQuestion, QuestionFormProps, Question } from "@/types/question"
import { generateAndDownloadPDF } from "@/components/PDFGenerator"

interface PreviewAnswer {
  id?: number
  answer_text?: string
  text?: string
  is_correct?: boolean
  correct?: boolean
}

const availableTypes = [
  { value: "multiple_choice", label: "Trắc nghiệm nhiều lựa chọn", description: "1 đáp án đúng", icon: "📝" },
  { value: "true_false", label: "Đúng/Sai", description: "Câu hỏi nhị phân", icon: "✓" },
  { value: "multiple_select", label: "Chọn nhiều đáp án", description: "Nhiều đáp án đúng", icon: "☑" },
  { value: "open_ended", label: "Tự luận", description: "Câu hỏi mở", icon: "✍" },
] as const

export default function QuestionForm({ onCancel, initialData }: QuestionFormProps) {
  const userStr = localStorage.getItem("user")
  const user = userStr ? JSON.parse(userStr) : null
  const userId = user?.id || 1

  const initialSelectedTypes = initialData?.selected_types || ["multiple_choice"]
  const initialType = initialData?.type || (initialSelectedTypes.length > 1 ? "mixed" : initialSelectedTypes[0])
  const [typeQuantities, setTypeQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    availableTypes.forEach((t) => {
      const fromInitial = initialData?.type_quantities?.[t.value]
      init[t.value] = fromInitial !== undefined ? fromInitial : initialSelectedTypes.includes(t.value) ? 5 : 0
    })
    return init
  })

  type QuestionTypeKeys = "multiple_choice" | "true_false" | "multiple_select" | "open_ended"

  const [formData, setFormData] = useState<Required<QuestionFormData>>({
    exercise_name: initialData?.exercise_name || "",
    type: initialType as "multiple_choice" | "open_ended" | "mixed",
    selected_types: initialSelectedTypes as QuestionTypeKeys[],
    lesson_name: initialData?.lesson_name || initialData?.topic || "",
    num_questions: initialData?.num_questions || initialData?.quantity || 5,
    num_answers: initialData?.num_answers || initialData?.number_of_answers || 4,
    difficulty: initialData?.difficulty || "Medium",
    user_id: initialData?.user_id || userId,
    topic: "",
    quantity: 0,
    number_of_answers: 0,
    description: "",
    question_text: "",
    emoji: "",
    question_type: "",
    answers: [],
    explanation: "",
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

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [generatedPreview, setGeneratedPreview] = useState<InsertedQuestion[]>([])
  const [showPreview, setShowPreview] = useState(false)

  const hasMultipleChoice = formData.selected_types.includes("multiple_choice")

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    const parsedValue = ["num_questions", "num_answers"].includes(name) ? Number.parseInt(value) || 0 : value
    setFormData((prev) => ({ ...prev, [name]: parsedValue }))
  }

  const handleTypeChange = (typeValue: "multiple_choice" | "open_ended" | "true_false" | "multiple_select") => {
    const wasSelected = formData.selected_types.includes(typeValue)
    const newTypes = wasSelected
      ? formData.selected_types.filter((t) => t !== typeValue)
      : [...formData.selected_types, typeValue]

    const newType = newTypes.length > 1 ? "mixed" : newTypes[0] || "multiple_choice"

    setFormData((prev) => ({
      ...prev,
      selected_types: newTypes as ("multiple_choice" | "open_ended" | "true_false" | "multiple_select")[],
      type: newType as "multiple_choice" | "open_ended" | "mixed",
    }))

    setTypeQuantities((prev) => {
      const newQ = { ...prev }
      if (wasSelected) {
        newQ[typeValue] = 0
      } else {
        if (newQ[typeValue] <= 0) newQ[typeValue] = 5
      }
      return newQ
    })
  }

  const incrementQuantity = (typeValue: string) => {
    setTypeQuantities((prev) => ({
      ...prev,
      [typeValue]: Math.min((prev[typeValue] || 0) + 1, 50),
    }))
  }

  const decrementQuantity = (typeValue: string) => {
    setTypeQuantities((prev) => ({
      ...prev,
      [typeValue]: Math.max((prev[typeValue] || 0) - 1, 1),
    }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")

    if (!formData.exercise_name?.trim()) return setError("Vui lòng nhập tên bài tập")
    if (!formData.lesson_name?.trim()) return setError("Vui lòng nhập tên bài học")
    if ((formData.num_questions || 0) < 1 || (formData.num_questions || 0) > 50)
      return setError("Số câu hỏi phải từ 1 đến 50")
    if (formData.selected_types.length === 0) return setError("Vui lòng chọn ít nhất 1 loại câu hỏi")
    if (hasMultipleChoice && (!formData.num_answers || formData.num_answers < 2 || formData.num_answers > 5)) {
      return setError("Số đáp án phải từ 2-5 cho trắc nghiệm nhiều lựa chọn")
    }

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
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Lỗi khi tạo câu hỏi")
      }

      const generatedData = await response.json()

      setGeneratedPreview(generatedData.questions || [])
      console.log("Generated Questions:", generatedData.questions)
      setShowPreview(true)
    } catch (err: unknown) {
      setError((err as Error).message || "Lỗi khi tạo câu hỏi. Vui lòng thử lại.")
    } finally {
      setIsLoading(false)
    }
  }

  const confirmSave = () => {
    const mappedQuestions: Question[] = generatedPreview.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      emoji: q.emoji || "",
      question_type: q.type_name || "Auto-generated",
      answers: q.answers || [],
      explanation: q.explanation || "",
    }))

    setGeneratedPreview([])
    setShowPreview(false)

    setFormData({
      exercise_name: "",
      type: "multiple_choice",
      selected_types: ["multiple_choice"],
      lesson_name: "",
      num_questions: 5,
      num_answers: 4,
      difficulty: "Medium",
      user_id: userId,
      topic: "",
      quantity: 0,
      number_of_answers: 0,
      description: "",
      question_text: "",
      emoji: "",
      question_type: "",
      answers: [],
      explanation: "",
      type_quantities: {
        multiple_choice: 5,
        true_false: 5,
        multiple_select: 5,
        open_ended: 5,
      },
    })
  }

  useEffect(() => {
    const totalQuestions = formData.selected_types.reduce((sum, type) => {
      return sum + (typeQuantities[type] || 0)
    }, 0)

    setFormData((prev) => ({ ...prev, num_questions: totalQuestions }))
  }, [formData.selected_types, typeQuantities])

  const difficulties = ["Dễ", "Bình thường", "Khó"]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 border-b border-border pb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Tạo Bài Tập Mới</h2>
            <p className="text-sm text-muted-foreground">Tạo bài tập tự động bằng AI cho học sinh THPT</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-2">
          <Label htmlFor="exercise_name" className="text-base font-medium">
            Tên Bài Tập <span className="text-destructive">*</span>
          </Label>
          <Input
            id="exercise_name"
            name="exercise_name"
            placeholder="VD: Kiểm tra 15 phút - Phương trình bậc 2"
            value={formData.exercise_name || ""}
            onChange={handleInputChange}
            disabled={isLoading}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lesson_name" className="text-base font-medium flex items-center gap-2">
            Nội Dung Bài Học <span className="text-destructive">*</span>
            <HoverCard>
              <HoverCardTrigger asChild>
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <p className="text-sm">
                  Mô tả chi tiết nội dung bài học để AI tạo câu hỏi phù hợp. VD: Phương trình bậc 2 - Công thức nghiệm,
                  biệt thức delta, điều kiện có nghiệm...
                </p>
              </HoverCardContent>
            </HoverCard>
          </Label>
          <Textarea
            id="lesson_name"
            name="lesson_name"
            placeholder="VD: Chương 3 - Phương trình bậc 2: Công thức nghiệm, biệt thức delta, điều kiện có nghiệm..."
            value={formData.lesson_name || ""}
            onChange={handleInputChange}
            rows={4}
            disabled={isLoading}
            className="resize-none"
          />
        </div>

        <div className="space-y-4">
          <Label className="text-base font-medium flex items-center gap-2">
            Loại Câu Hỏi <span className="text-destructive">*</span>
            <HoverCard>
              <HoverCardTrigger asChild>
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <p className="text-sm">
                  Chọn các dạng câu hỏi muốn tạo. Bạn có thể kết hợp nhiều loại trong một bài tập.
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
                          <Label className="text-sm font-medium min-w-fit">Số câu hỏi:</Label>
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

                            <span className="text-sm text-muted-foreground ml-1">câu</span>
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

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-base font-medium">Tổng Số Câu Hỏi</Label>
            <div className="relative">
              <Input
                type="number"
                value={formData.num_questions || 0}
                disabled
                className="h-11 bg-muted/30 cursor-not-allowed font-semibold text-lg"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-background px-2 rounded">
                tự động
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Tổng số câu = tổng các loại đã chọn</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="difficulty" className="text-base font-medium flex items-center gap-2">
              Độ Khó <span className="text-destructive">*</span>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <p className="text-sm">
                    <strong>Dễ:</strong> Câu hỏi cơ bản
                    <br />
                    <strong>Bình thường:</strong> Câu hỏi trung bình
                    <br />
                    <strong>Khó:</strong> Câu hỏi nâng cao
                  </p>
                </HoverCardContent>
              </HoverCard>
            </Label>
            <select
              id="difficulty"
              name="difficulty"
              value={formData.difficulty || "Medium"}
              onChange={handleInputChange}
              disabled={isLoading}
              className="w-full h-11 px-3 border border-input rounded-lg bg-background text-foreground font-medium"
            >
              {difficulties.map((diff) => (
                <option key={diff} value={diff}>
                  {diff}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasMultipleChoice && (
          <div className="space-y-2">
            <Label htmlFor="num_answers" className="text-base font-medium flex items-center gap-2">
              Số Đáp Án (cho câu trắc nghiệm) <span className="text-destructive">*</span>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <p className="text-sm">Số lượng đáp án cho câu hỏi trắc nghiệm nhiều lựa chọn (2-5 đáp án)</p>
                </HoverCardContent>
              </HoverCard>
            </Label>
            <Input
              id="num_answers"
              type="number"
              name="num_answers"
              min={2}
              max={5}
              step={1}
              value={formData.num_answers || 4}
              onChange={handleInputChange}
              disabled={isLoading}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">Từ 2 đến 5 đáp án</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg text-sm font-medium">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="h-11 px-6 bg-transparent"
          >
            Hủy
          </Button>
          <Button type="submit" disabled={isLoading} className="h-11 px-8">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang Tạo...
              </>
            ) : (
              "Tạo Câu Hỏi"
            )}
          </Button>
        </div>
      </form>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Câu hỏi tạo từ AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {generatedPreview.length > 0 ? (
              generatedPreview.map((q, index) => (
                <div key={q.id || index} className="p-4 border rounded-lg">
                  <h4 className="font-bold">
                    {q.question_text} {q.emoji}
                  </h4>
                  {Array.isArray(q.answers) && q.answers.length > 0 ? (
                    <ul className="list-disc ml-4 mt-2">
                      {q.answers.map((ans: PreviewAnswer, i: number) => {
                        const answerText = ans.answer_text || ans.text || (typeof ans === "string" ? ans : String(ans))
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
                    <p className="text-sm text-muted-foreground mt-2">Không có đáp án chi tiết (kiểm tra backend).</p>
                  ) : null}
                  {q.model_answer && <p className="mt-2 italic text-sm">Đáp án mẫu: {q.model_answer}</p>}
                  <p className="mt-2 italic text-sm">{q.explanation}</p>
                  <p className="text-xs text-muted-foreground mt-1">Loại: {q.type_name || "Tự động"}</p>
                </div>
              ))
            ) : (
              <p>Không có câu hỏi nào được generate.</p>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6 flex-wrap">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Hủy
            </Button>

            <Button
              variant="secondary"
              onClick={() =>
                generateAndDownloadPDF(generatedPreview, {
                  exerciseName: formData.exercise_name,
                  lessonName: formData.lesson_name,
                  className: "",
                  bookName: "",
                  filename: `${formData.exercise_name || "Bai-tap"} - khong-dap-an.pdf`,
                  showAnswers: false,
                  showExplanation: false,
                })
              }
            >
              PDF Không Đáp Án
            </Button>

            <Button
              onClick={() =>
                generateAndDownloadPDF(generatedPreview, {
                  exerciseName: formData.exercise_name,
                  lessonName: formData.lesson_name,
                  className: "",
                  bookName: "",
                  filename: `${formData.exercise_name || "Bai-tap"} - co-dap-an.pdf`,
                  showAnswers: true,
                  showExplanation: true,
                })
              }
            >
              PDF Có Đáp Án & Giải Thích
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
