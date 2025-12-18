import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { OkPacket, RowDataPacket, FieldPacket } from "mysql2/promise";

interface Question extends RowDataPacket {
  id: number;
  exercise_id: number;
  question_text: string;
  emoji: string | null;
  explanation: string | null;
  model_answer: string | null;
  correct_answer_id: number | null;
  question_type_id: number | null;
  order_num: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exerciseId = searchParams.get("exercise_id");

  let sql = "SELECT * FROM questions";
  const params: (string | number)[] = [];

  if (exerciseId) {
    sql += " WHERE exercise_id = ?";
    params.push(Number(exerciseId));
  }

  sql += " ORDER BY order_num ASC";

  const [rows]: [Question[], FieldPacket[]] = await db.execute(sql, params);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { exercise_id, question_text, emoji, explanation, model_answer, question_type_id, order_num } = body;

  if (!exercise_id || !question_text) {
    return NextResponse.json({ error: "Thiếu dữ liệu bắt buộc" }, { status: 400 });
  }

  const [result]: [OkPacket, FieldPacket[]] = await db.execute(
    `INSERT INTO questions (exercise_id, question_text, emoji, explanation, model_answer, question_type_id, order_num)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [exercise_id, question_text, emoji, explanation, model_answer, question_type_id, order_num || 1]
  );

  return NextResponse.json({ message: "Thêm câu hỏi thành công", id: result.insertId });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, question_text, explanation, model_answer } = body;

  if (!id) return NextResponse.json({ error: "Thiếu ID câu hỏi" }, { status: 400 });

  await db.execute(
    "UPDATE questions SET question_text = ?, explanation = ?, model_answer = ? WHERE id = ?",
    [question_text, explanation, model_answer, id]
  );

  return NextResponse.json({ message: "Cập nhật câu hỏi thành công" });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Thiếu ID để xóa" }, { status: 400 });

  await db.execute("DELETE FROM questions WHERE id = ?", [id]);
  return NextResponse.json({ message: "Xóa câu hỏi thành công" });
}
