"use client"
import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import QuestionForm from "@/components/form/question-form"


export default function QuestionsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false)

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full text-center space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Q-GEN AI: NGƯỜI BẠN ÔN TẬP SỐ <br></br>CỦA HỌC SINH THPT
          </h1>
          <div className="space-y-2 text-lg text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Giáo viên hướng dẫn:</span> Nguyễn Thị Thùy Mỵ
              </p>
              <p>
                <span className="font-semibold text-foreground">Học sinh:</span> Võ Thị Mỹ Tiên
              </p>
          </div>
          <p className="text-xl text-muted-foreground">
            Tạo và quản lý bộ câu hỏi của bạn một cách dễ dàng
          </p>
        </div>

        {/* Big centered button */}
        <Card className="p-12 shadow-2xl hover:shadow-3xl transition-shadow duration-300 border-2">
          <Button
            onClick={() => setIsFormOpen(true)}
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
                Tạo Bài Tập Mới
              </h2>
              <QuestionForm
                onCancel={() => setIsFormOpen(false)}
                initialData={{
                  exercise_name: "",
                  lesson_name: "",
                  type: "multiple_choice",
                }}
              />
            </div>
          </Card>
        </div>
      )}
    </main>
  )
}
