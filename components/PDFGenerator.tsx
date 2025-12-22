// src/components/PDFGenerator.tsx
"use client"

import { Document, Page, Text, View, StyleSheet, pdf, Font } from "@react-pdf/renderer"
import { saveAs } from "file-saver"
import type { InsertedQuestion } from "@/types/question"

// Đăng ký font Roboto
Font.register({
  family: "Roboto",
  fonts: [
    { src: "/fonts/Roboto-Regular.ttf", fontWeight: "normal" },
    { src: "/fonts/Roboto-Bold.ttf", fontWeight: "bold" },
    { src: "/fonts/Roboto-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
  ],
})

// Hỗ trợ emoji
Font.registerEmojiSource({
  format: "png",
  url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/",
})

// Styles
const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: "Roboto", backgroundColor: "#fff" },
  title: { fontSize: 20, marginBottom: 12, fontWeight: "bold", textAlign: "center" },
  lessonInfo: { fontSize: 14, marginBottom: 20, textAlign: "center", color: "#555", fontStyle: "italic" },
  questionBlock: { marginBottom: 32 },
  question: { fontSize: 14, marginBottom: 12, lineHeight: 1.5 },
  answers: { marginLeft: 20 },
  answer: { fontSize: 13, marginBottom: 6 },
  correctAnswer: { color: "#16a34a", fontWeight: "bold" }, // Chỉ dùng khi showAnswers = true
  explanation: { fontSize: 12, marginTop: 14, marginLeft: 20, fontStyle: "italic", color: "#444" },
  blankSpace: { marginTop: 12, marginBottom: 30, minHeight: 100 },
})

interface GeneratePDFOptions {
  filename?: string
  exerciseName?: string
  lessonName?: string
  className?: string
  bookName?: string
  showAnswers?: boolean
  showExplanation?: boolean
}

// Xử lý answers từ backend
const processAnswers = (answers: any[] = []) => {
  return answers.map((ans: any, i: number) => {
    if (typeof ans === "string") {
      const isCorrect = ans.toLowerCase().includes("(correct)")
      const text = ans.replace(/\(correct\)/gi, "").trim()
      return { text, isCorrect }
    }
    return {
      text: ans.answer_text || ans.text || String(ans),
      isCorrect: !!ans.is_correct || !!ans.correct,
    }
  })
}

const MyDocument = ({
  questions,
  exerciseName = "Bài Tập",
  lessonName = "",
  showAnswers = true,
  showExplanation = true,
}: {
  questions: InsertedQuestion[]
  exerciseName?: string
  lessonName?: string
  showAnswers?: boolean
  showExplanation?: boolean
}) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View>
        <Text style={styles.title}>{exerciseName}</Text>
        {lessonName && (
          <Text style={styles.lessonInfo}>
            Bài học: 📖 {lessonName}
          </Text>
        )}
      </View>

      {questions
        .filter((q): q is InsertedQuestion => !!q && !!q.question_text)
        .map((q, index) => {
          const processedAnswers = processAnswers(q.answers)
          const isOpenEnded = !q.answers || q.answers.length === 0 || q.question_type_id === 4

          return (
            <View key={q.id || index} style={styles.questionBlock}>
              {/* Câu hỏi */}
              <Text style={styles.question}>
                <Text style={{ fontWeight: "bold" }}>Câu {index + 1}:</Text> {q.emoji || ""} {q.question_text}
              </Text>

              {/* TRẮC NGHIỆM */}
              {!isOpenEnded && processedAnswers.length > 0 && (
                <View style={styles.answers}>
                  {processedAnswers.map((ans, i) => (
                    <Text
                      key={i}
                      style={{
                        ...styles.answer,
                        // Chỉ áp dụng style đáp án đúng khi showAnswers = true
                        ...(showAnswers && ans.isCorrect ? styles.correctAnswer : {}),
                      }}
                    >
                      {String.fromCharCode(65 + i)}.{" "}
                      {/* Chỉ hiện dấu ✓ khi có đáp án */}
                      {showAnswers && ans.isCorrect ? "✓ " : ""}
                      {ans.text}
                    </Text>
                  ))}
                </View>
              )}

              {/* TỰ LUẬN - Có đáp án */}
              {showAnswers && isOpenEnded && q.model_answer && (
                <Text style={[styles.answer, styles.correctAnswer]}>
                  Đáp án mẫu: {q.model_answer}
                </Text>
              )}

              {/* TỰ LUẬN - Không đáp án: để khoảng trống viết tay */}
              {!showAnswers && isOpenEnded && (
                <View style={styles.blankSpace}>
                  <View style={{ borderBottomWidth: 1, borderBottomColor: "#ccc", marginBottom: 8 }} />
                  <View style={{ borderBottomWidth: 1, borderBottomColor: "#ccc", marginBottom: 8 }} />
                  <View style={{ borderBottomWidth: 1, borderBottomColor: "#ccc", marginBottom: 8 }} />
                  <View style={{ borderBottomWidth: 1, borderBottomColor: "#ccc" }} />
                </View>
              )}

              {/* GIẢI THÍCH - chỉ hiện khi có đáp án */}
              {showAnswers && showExplanation && q.explanation && (
                <Text style={styles.explanation}>
                  Giải thích: {q.explanation}
                </Text>
              )}
            </View>
          )
        })}
    </Page>
  </Document>
)

export const generateAndDownloadPDF = async (
  questions: InsertedQuestion[],
  options: GeneratePDFOptions = {}
) => {
  const {
    filename = "bai-tap.pdf",
    exerciseName = "Bài Tập",
    lessonName = "",
    showAnswers = true,
    showExplanation = true,
  } = options

  try {
    const doc = (
      <MyDocument
        questions={questions}
        exerciseName={exerciseName}
        lessonName={lessonName}
        showAnswers={showAnswers}
        showExplanation={showExplanation}
      />
    )

    const blob = await pdf(doc).toBlob()
    saveAs(blob, filename)
  } catch (error) {
    console.error("Lỗi khi tạo PDF:", error)
    alert("Không thể tạo PDF. Vui lòng thử lại.")
  }
}