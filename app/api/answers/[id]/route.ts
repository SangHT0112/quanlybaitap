// app/api/answers/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { PoolConnection, RowDataPacket, FieldPacket, ResultSetHeader } from 'mysql2/promise'; // Import types đầy đủ

interface AnswerUpdate {
  question_id?: number;
  answer_text?: string;
  is_correct?: boolean;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection: PoolConnection | null = null;
  try {
    const { id } = await params;
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      return NextResponse.json({ error: 'ID không hợp lệ' }, { status: 400 });
    }

    const updateData: AnswerUpdate = await request.json();

    if (!updateData || Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu cập nhật' }, { status: 400 });
    }

    if (!db) throw new Error('DB pool không tồn tại từ lib/db');

    connection = await db.getConnection();
    if (!connection) throw new Error('Không thể lấy connection từ db pool');

    await connection.beginTransaction();

    const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const paramsArray = Object.values(updateData);

    const [result]: [ResultSetHeader, FieldPacket[]] = await connection.execute(  // Type for UPDATE result
      `UPDATE answers SET ${setClause} WHERE id = ?`,
      [...paramsArray, parsedId]
    );

    if (result.affectedRows === 0) {  // No 'any' cast, thanks to ResultSetHeader
      return NextResponse.json({ error: 'Không tìm thấy answer để cập nhật' }, { status: 404 });
    }

    await connection.commit();

    const [updatedRow]: [RowDataPacket[], FieldPacket[]] = await connection.execute(  // Type destructuring
      'SELECT id, question_id, answer_text, is_correct FROM answers WHERE id = ?',
      [parsedId]
    );

    if (!updatedRow.length) {
      return NextResponse.json({ error: 'Không tìm thấy answer sau cập nhật' }, { status: 500 });
    }

    return NextResponse.json(updatedRow[0]);  // [0] now safe as RowDataPacket
  } catch (error: unknown) {
    if (connection) await connection.rollback();
    console.error('Error updating answer:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection: PoolConnection | null = null;
  try {
    const { id } = await params;
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      return NextResponse.json({ error: 'ID không hợp lệ' }, { status: 400 });
    }

    if (!db) throw new Error('DB pool không tồn tại từ lib/db');

    connection = await db.getConnection();
    if (!connection) throw new Error('Không thể lấy connection từ db pool');

    await connection.beginTransaction();

    const [result]: [ResultSetHeader, FieldPacket[]] = await connection.execute(  // Type for DELETE result
      'DELETE FROM answers WHERE id = ?',
      [parsedId]
    );

    if (result.affectedRows === 0) {  // No 'any' cast
      return NextResponse.json({ error: 'Không tìm thấy answer để xóa' }, { status: 404 });
    }

    await connection.commit();

    return NextResponse.json({ success: true, deletedId: parsedId });
  } catch (error: unknown) {
    if (connection) await connection.rollback();
    console.error('Error deleting answer:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}