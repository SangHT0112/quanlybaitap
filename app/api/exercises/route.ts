import db from "@/lib/db"
import { NextRequest } from "next/server"

interface RowData {
  exercise_id: number
  exercise_name: string
  lesson_name: string
  question_id: number | null
  question_text: string | null
  question_type: string | null
  emoji: string | null
  answer_id: number | null
  answer_text: string | null
  is_correct: number | null
}

interface Answer {
  id: number
  answer_text: string
  is_correct: boolean
}

interface Question {
  id: number
  question_text: string
  question_type: string
  emoji?: string
  answers: Answer[]
}

interface Exercise {
  id: number
  name: string
  lesson_name: string
  questions: Question[]
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("user_id")
    if (!userId) {
      return Response.json({ error: "Thiếu user_id" }, { status: 400 })
    }
    console.log("Fetching exercises for user_id:", userId)
    // ✅ Ép kiểu sau khi lấy kết quả query
    const [rows] = await db.query<any[]>(`
      SELECT 
        e.id AS exercise_id, 
        e.name AS exercise_name, 
        e.lesson_name, 
        q.id AS question_id, 
        q.question_text, 
        q.emoji,
        a.id AS answer_id, 
        a.answer_text, 
        a.is_correct
      FROM exercises e
      LEFT JOIN questions q ON e.id = q.exercise_id
      LEFT JOIN answers a ON q.id = a.question_id
      WHERE e.user_id = ?
      ORDER BY e.id, q.id, a.id
    `, [userId])

    const data = rows as RowData[]

    const grouped: Exercise[] = Object.values(
      data.reduce<Record<number, Exercise>>((acc, row) => {
        if (!acc[row.exercise_id]) {
          acc[row.exercise_id] = {
            id: row.exercise_id,
            name: row.exercise_name,
            lesson_name: row.lesson_name,
            questions: [],
          }
        }

        const exercise = acc[row.exercise_id]

        if (row.question_id) {
          let question = exercise.questions.find((q) => q.id === row.question_id)
          if (!question) {
            question = {
              id: row.question_id,
              question_text: row.question_text ?? "",
              question_type: row.question_type ?? "",
              emoji: row.emoji ?? undefined,
              answers: [],
            }
            exercise.questions.push(question)
          }

          if (row.answer_id) {
            question.answers.push({
              id: row.answer_id,
              answer_text: row.answer_text ?? "",
              is_correct: !!row.is_correct,
            })
          }
        }

        return acc
      }, {})
    )

    return Response.json(grouped)
  } catch (err) {
    console.error("Error fetching exercises:", err)
    return Response.json({ error: "Failed to load exercises" }, { status: 500 })
  }
}
