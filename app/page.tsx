"use client"
import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import QuestionForm from "@/components/form/question-form"
import type { Question, QuestionFormData } from "@/types/question"


export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)


  const handleAddQuestion = async (data: QuestionFormData | Question | Question[]) => {
    try {
      if (Array.isArray(data)) {
        setQuestions((prev) => [...prev, ...data])
      } else if ("id" in data && (data as Question).question_text) {
        const questionId = (data as Question).id
        const res = await fetch(`/api/questions/${questionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error("Lỗi cập nhật câu hỏi")
        setQuestions((prev) => prev.map((q) => (q.id === questionId ? data : q)))
        setEditingQuestion(null)
      } else {
        const formData = data as QuestionFormData
        const questionData = {
          question_text: formData.topic || formData.question_text || "",
          question_type: formData.question_type || "",
          answers:
            formData.answers?.map(
              (
                a: { id?: number | string; answer_text?: string; text?: string; is_correct?: boolean },
                idx: number,
              ) => ({
                id:
                  typeof a.id === "number"
                    ? a.id
                    : editingQuestion
                      ? editingQuestion.answers.length + idx + 1
                      : Date.now() + idx,
                answer_text: a.answer_text || a.text || "",
                is_correct: !!a.is_correct,
              }),
            ) || [],
          explanation: formData.explanation || "",
          emoji: formData.emoji || "",
        }
        let newQuestion: Question
        if (editingQuestion) {
          const res = await fetch(`/api/questions/${editingQuestion.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(questionData),
          })
          if (!res.ok) throw new Error("Lỗi cập nhật câu hỏi")
          newQuestion = {
            ...editingQuestion,
            question_text: questionData.question_text,
            question_type: questionData.question_type,
            answers: questionData.answers,
            explanation: questionData.explanation,
            emoji: questionData.emoji,
          }
          setQuestions((prev) => prev.map((q) => (q.id === editingQuestion.id ? newQuestion : q)))
          setEditingQuestion(null)
        } else {
          const res = await fetch("/api/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(questionData),
          })
          if (!res.ok) throw new Error("Lỗi tạo câu hỏi mới")
          newQuestion = await res.json()
          setQuestions((prev) => [...prev, newQuestion])
        }
      }
    } catch (err: unknown) {
      console.error("Error handling question add:", err)
      setError(err instanceof Error ? err.message : "Lỗi xử lý câu hỏi")
    }

    setIsFormOpen(false)
  }


  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Card className="p-8 text-center shadow-xl max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <p className="text-destructive text-lg mb-4">{error}</p>
          <Button onClick={() => window.location.reload()} size="lg">
            Thử lại
          </Button>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full text-center space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Tạo câu hỏi bằng AI
          </h1>

          {/* Tên giảng viên */}
          <p className="text-lg font-semibold text-gray-700">
            Giáo viên hướng dẫn: <span className="text-primary">NGUYỄN THỊ THÙY MỴ</span>
          </p>

          <p className="text-xl text-muted-foreground">
            Tạo và quản lý bộ câu hỏi của bạn một cách dễ dàng
          </p>

          {questions.length > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full">
              <span className="text-2xl">📚</span>
              <span className="text-lg font-semibold text-primary">
                {questions.length} câu hỏi đã tạo
              </span>
            </div>
          )}
        </div>


        {/* Big centered button */}
        <Card className="p-12 shadow-2xl hover:shadow-3xl transition-shadow duration-300 border-2">
          <Button
            onClick={() => {
              setEditingQuestion(null)
              setIsFormOpen(true)
            }}
            size="lg"
            className="h-24 px-12 text-2xl font-bold gap-4 w-full max-w-md mx-auto shadow-lg hover:scale-105 transition-transform duration-200"
          >
            <Plus className="w-10 h-10" />
            Tạo Bài Tập Mới
          </Button>
          <p className="text-muted-foreground mt-6 text-lg">Nhấn vào nút để bắt đầu tạo bài tập với AI</p>
        </Card>

      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {editingQuestion ? "Chỉnh Sửa Câu Hỏi" : "Tạo Bài Tập Mới"}
              </h2>
              <QuestionForm
                onSubmit={handleAddQuestion}
                onCancel={() => {
                  setIsFormOpen(false)
                  setEditingQuestion(null)
                }}
                initialData={
                  editingQuestion
                    ? {
                        topic: editingQuestion.question_text,
                        question_type: editingQuestion.question_type,
                        answers: editingQuestion.answers,
                        explanation: editingQuestion.explanation,
                        emoji: editingQuestion.emoji,
                      }
                    : {
                        exercise_name: "",
                        lesson_name: "",
                        type: "multiple_choice",
                      }
                }
              />
            </div>
          </Card>
        </div>
      )}
    </main>
  )
}
