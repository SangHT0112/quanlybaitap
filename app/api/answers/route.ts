import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { OkPacket, RowDataPacket, FieldPacket } from "mysql2/promise";

interface Answer extends RowDataPacket {
  id: number;
  question_id: number;
  answer_text: string;
  is_correct: boolean;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const questionId = searchParams.get("question_id");

  let sql = "SELECT * FROM answers";
  const params: (string | number)[] = [];

  if (questionId) {
    sql += " WHERE question_id = ?";
    params.push(Number(questionId));
  }

  const [rows]: [Answer[], FieldPacket[]] = await db.execute(sql, params);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { question_id, answer_text, is_correct } = body;

  if (!question_id || !answer_text) {
    return NextResponse.json({ error: "Thiếu dữ liệu bắt buộc" }, { status: 400 });
  }

  const [result]: [OkPacket, FieldPacket[]] = await db.execute(
    `INSERT INTO answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)`,
    [question_id, answer_text, !!is_correct]
  );

  return NextResponse.json({ message: "Thêm câu trả lời thành công", id: result.insertId });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, answer_text, is_correct } = body;

  if (!id) return NextResponse.json({ error: "Thiếu ID câu trả lời" }, { status: 400 });

  await db.execute("UPDATE answers SET answer_text = ?, is_correct = ? WHERE id = ?", [
    answer_text,
    !!is_correct,
    id,
  ]);

  return NextResponse.json({ message: "Cập nhật câu trả lời thành công" });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Thiếu ID để xóa" }, { status: 400 });

  await db.execute("DELETE FROM answers WHERE id = ?", [id]);
  return NextResponse.json({ message: "Xóa câu trả lời thành công" });
}
