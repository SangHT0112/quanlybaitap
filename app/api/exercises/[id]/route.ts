import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const [rows]: any = await db.query("SELECT * FROM exercises WHERE id = ?", [params.id]);
  if (!rows.length) return NextResponse.json({ error: "Không tìm thấy bài tập" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { name, lesson_name } = await req.json();
  await db.query("UPDATE exercises SET name = ?, lesson_name = ? WHERE id = ?", [
    name,
    lesson_name,
    params.id,
  ]);
  return NextResponse.json({ success: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await db.query("DELETE FROM exercises WHERE id = ?", [params.id]);
  return NextResponse.json({ success: true });
}
