// src/components/PDFGenerator.tsx
"use client"

import { Document, Page, Text, View, StyleSheet, pdf, Font } from "@react-pdf/renderer"
import { saveAs } from "file-saver"
import type { InsertedQuestion } from "@/types/question"

/**
 * Đăng ký font Roboto cho PDF.
 * Cách viết: Sử dụng Font.register với mảng fonts (regular, bold, italic).
 * Cách làm: Load từ /fonts/ để hỗ trợ tiếng Việt và style.
 * Cách thực hiện: Gọi một lần khi import module, áp dụng cho toàn bộ Document.
 */
Font.register({
  family: "Roboto",
  fonts: [
    { src: "/fonts/Roboto-Regular.ttf", fontWeight: "normal" },
    { src: "/fonts/Roboto-Bold.ttf", fontWeight: "bold" },
    { src: "/fonts/Roboto-Italic.ttf", fontWeight: "normal", fontStyle: "italic" },
  ],
})

// Hỗ trợ emoji trong PDF
// Cách làm: Sử dụng Twemoji PNG từ CDN để render emoji.
// Cách thực hiện: Gọi Font.registerEmojiSource, tự động áp dụng cho Text với emoji.
Font.registerEmojiSource({
  format: "png",
  url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/",
})

/**
 * Styles cho PDF sử dụng StyleSheet.
 * Cách viết: Tạo object với StyleSheet.create để optimize render.
 * Cách làm: Định nghĩa styles cho page, title, question, answers, etc.
 * Cách thực hiện: Áp dụng qua style prop trong các component PDF.
 */
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

/**
 * Interface cho options khi generate PDF.
 * Cách viết: Optional fields để linh hoạt.
 * Cách làm: Sử dụng để config filename, names, show/hide answers/explanation.
 * Cách thực hiện: Default values trong function.
 */
interface GeneratePDFOptions {
  filename?: string
  exerciseName?: string
  lessonName?: string
  className?: string
  bookName?: string
  showAnswers?: boolean
  showExplanation?: boolean
}

/**
 * Xử lý answers từ backend (hỗ trợ format string hoặc object).
 * Cách viết: Map qua answers, detect "(correct)" hoặc is_correct flag.
 * Cách làm: Normalize thành {text, isCorrect} để dễ render.
 * Cách thực hiện: Gọi trong MyDocument cho mỗi question.
 */
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

/**
 * Component MyDocument: Nội dung PDF chính.
 * Cách viết: Functional component trả về <Document><Page>...</Page></Document>.
 * Cách làm: Render title, lesson info, loop questions với conditional answers/explanation/blank.
 * Cách thực hiện: Sử dụng processAnswers để handle trắc nghiệm; detect open_ended qua !answers hoặc type_id=4.
 * Lưu ý: Conditional render dựa trên showAnswers/showExplanation.
 */
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
        .filter((q): q is InsertedQuestion => !!q && !!q.question_text) // Filter valid questions
        .map((q, index) => {
          const processedAnswers = processAnswers(q.answers)
          const isOpenEnded = !q.answers || q.answers.length === 0 || q.question_type_id === 4

          return (
            <View key={q.id || index} style={styles.questionBlock}>
              {/* Câu hỏi: Render số thứ tự + emoji + text */}
              <Text style={styles.question}>
                <Text style={{ fontWeight: "bold" }}>Câu {index + 1}:</Text> {q.emoji || ""} {q.question_text}
              </Text>

              {/* TRẮC NGHIỆM: Render answers với A/B/C..., chỉ ✓ nếu showAnswers */}
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

              {/* TỰ LUẬN - Có đáp án: Render model_answer nếu showAnswers */}
              {showAnswers && isOpenEnded && q.model_answer && (
                <Text style={[styles.answer, styles.correctAnswer]}>
                  Đáp án mẫu: {q.model_answer}
                </Text>
              )}

              {/* TỰ LUẬN - Không đáp án: Để khoảng trống viết tay (lines) */}
              {!showAnswers && isOpenEnded && (
                <View style={styles.blankSpace}>
                  <View style={{ borderBottomWidth: 1, borderBottomColor: "#ccc", marginBottom: 8 }} />
                  <View style={{ borderBottomWidth: 1, borderBottomColor: "#ccc", marginBottom: 8 }} />
                  <View style={{ borderBottomWidth: 1, borderBottomColor: "#ccc", marginBottom: 8 }} />
                  <View style={{ borderBottomWidth: 1, borderBottomColor: "#ccc" }} />
                </View>
              )}

              {/* GIẢI THÍCH: Chỉ hiện khi showAnswers && showExplanation && có explanation */}
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

/**
 * Function chính: Tạo và download PDF.
 * Cách viết: Async function sử dụng pdf().toBlob() rồi saveAs.
 * Cách làm: Render MyDocument với props từ options, handle error với console/alert.
 * Cách thực hiện: Gọi từ UI (e.g., button click), default options nếu không truyền.
 */
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