// src/components/PDFGenerator.tsx
"use client"

import { Document, Page, Text, View, StyleSheet, pdf, Font } from "@react-pdf/renderer"
import { saveAs } from "file-saver"
import type { InsertedQuestion, Answer } from "@/types/question"

// --- Đăng ký font Roboto (dạng .ttf hỗ trợ bởi @react-pdf/renderer) ---
Font.register({
  family: "Roboto",
  fonts: [
    {
      src: "/fonts/Roboto-Regular.ttf",
      fontWeight: "normal",
      fontStyle: "normal",
    },
    {
      src: "/fonts/Roboto-Bold.ttf",
      fontWeight: "bold",
      fontStyle: "normal",
    },
    {
      src: "/fonts/Roboto-Italic.ttf",
      fontWeight: "normal",
      fontStyle: "italic",
    },
  ],
})

// --- Hỗ trợ emoji qua hình ảnh (Twemoji từ CDN - cần internet khi render) ---
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/',
})

// --- Style ---
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 20,
    fontFamily: "Roboto",
  },
  section: { margin: 10, padding: 10 },
  title: { 
    fontSize: 18, 
    marginBottom: 10, 
    fontWeight: "bold",
    textAlign: "center"
  },
  lessonInfo: {
    fontSize: 14,
    marginBottom: 15,
    textAlign: "center",
    color: "#666",
    fontStyle: "italic"
  },
  question: { 
    fontSize: 14, 
    marginBottom: 5,
    marginTop: 15
  },
  answer: { 
    fontSize: 12, 
    marginLeft: 10, 
    marginBottom: 2 
  },
  correct: { 
    color: "green", 
    fontWeight: "bold" 
  },
  explanation: { 
    fontSize: 11, 
    marginTop: 5, 
    fontStyle: "italic", 
    color: "#666" 
  },
})

// --- Chuẩn hóa đáp án ---
const processAnswers = (answers: any[]): Answer[] => {
  if (!Array.isArray(answers)) return []
  console.log("Processing answers:", answers)
  return answers.map((ans, i) => {
    if (typeof ans === "string") {
      const isCorrect = ans.includes("(correct)")
      return { 
        id: i + 1, 
        answer_text: ans.replace(" (correct)", "").trim(), 
        is_correct: isCorrect 
      }
    }
    if (typeof ans === "object") {
      return { 
        id: ans.id || i + 1, 
        answer_text: ans.answer_text || ans.text || String(ans), 
        is_correct: ans.is_correct ?? false 
      }
    }
    return { 
      id: i + 1, 
      answer_text: String(ans), 
      is_correct: false 
    }
  })
}

// --- Props cho PDF Document ---
interface MyDocumentProps {
  questions: InsertedQuestion[];
  exerciseName?: string;
  lessonName?: string;
  className?: string;
  bookName?: string;
}

// --- Component PDF ---
const MyDocument = ({ 
  questions, 
  exerciseName = "Bài Tập", 
  lessonName = "",
  className = "",
  bookName = ""
}: MyDocumentProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.section}>
        {/* Tiêu đề chính */}
        <Text style={styles.title}>{exerciseName}</Text>
        
        {/* Thông tin bài học - tương tự như trong form */}
        {lessonName && (
          <Text style={styles.lessonInfo}>
            Bài học: 📖 {lessonName}  {/* Emoji sẽ tự render nếu có hỗ trợ */}
          </Text>
        )}

        {(className || bookName) && (
          <Text style={styles.lessonInfo}>
            {className && `Lớp: ${className}`}
            {className && bookName && " • "}
            {bookName && `Sách: ${bookName}`}
          </Text>
        )}

        {/* Danh sách câu hỏi */}
        {questions
          .filter((q) => q) // loại bỏ null/undefined
          .map((q, index) => {
            return (
              <View key={q?.id || index} style={{ marginBottom: 20 }}>
                <Text style={styles.question}>
                  Câu {index + 1}: {q?.question_text || "Không có nội dung"}
                </Text>
               {(() => {
                const type = q.type_name || q.question_type || "multiple_choice"
                const processedAnswers = processAnswers(q.answers || [])

                // --- Câu hỏi True/False ---
                if (type === "true_false") {
                  return (
                    <View>
                      {["Đúng", "Sai"].map((opt, i) => (
                        <Text
                          key={i}
                          style={
                            processedAnswers[i]?.is_correct
                              ? [styles.answer, styles.correct]
                              : styles.answer
                          }
                        >
                          {String.fromCharCode(65 + i)}. {opt}
                        </Text>
                      ))}
                    </View>
                  )
                }

                // --- Câu hỏi nhiều đáp án đúng ---
                if (type === "multiple_select") {
                  return (
                    <View>
                      {processedAnswers.map((ans, i) => (
                        <Text key={ans?.id || i} style={styles.answer}>
                          {String.fromCharCode(65 + i)}.{" "}
                          {ans.is_correct && <Text style={styles.correct}>✓ </Text>}
                          {ans.answer_text}
                        </Text>
                      ))}
                    </View>
                  )
                }


                // --- Câu hỏi trắc nghiệm 1 đáp án đúng (default) ---
                if (type === "multiple_choice") {
                  return (
                    <View>
                      {processedAnswers.map((ans, i) => (
                        <Text
                          key={ans?.id || i}
                          style={ans.is_correct ? [styles.answer, styles.correct] : styles.answer}
                        >
                          {String.fromCharCode(65 + i)}. {ans.answer_text}
                        </Text>
                      ))}
                    </View>
                  )
                }

               

                // --- Các loại khác (tự luận, fill_blank, v.v.) ---
                return (
                  <Text style={styles.answer}>
                    ⬜ {q.model_answer || "Không có đáp án mẫu"}
                  </Text>
                )
              })()}

               
              </View>
            )
          })}

      </View>
    </Page>
  </Document>
)

// --- Hàm xuất PDF (cập nhật để nhận thêm thông tin) ---
interface GeneratePDFOptions {
  filename?: string;
  exerciseName?: string;
  lessonName?: string;
  className?: string;
  bookName?: string;
}

export const generateAndDownloadPDF = async (
  questions: InsertedQuestion[], 
  options: GeneratePDFOptions = {}
) => {
  const {
    filename = "cau-hoi-ai.pdf",
    exerciseName = "Bài Tập",
    lessonName = "",
    className = "",
    bookName = ""
  } = options

  try {
    const doc = (
      <MyDocument 
        questions={questions}
        exerciseName={exerciseName}
        lessonName={lessonName}
        className={className}
        bookName={bookName}
      />
    )
    const blob = await pdf(doc).toBlob()
    saveAs(blob, filename)
  } catch (error) {
    console.error("❌ Lỗi khi tạo PDF:", error)
  }
}