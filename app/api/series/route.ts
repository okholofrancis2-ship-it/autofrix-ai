import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET all saved series from Supabase
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ series: data });
  } catch (error: any) {
    console.error('Error fetching series history:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch series history.' },
      { status: 500 }
    );
  }
}

// UPDATE an existing series record in Supabase
export async function PUT(req: Request) {
  try {
    const { id, script, seriesName, niche, tone, language, duration, publishTime } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Series ID is required to update.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('series')
      .update({
        script,
        series_name: seriesName,
        niche,
        tone,
        language,
        duration,
        publish_time: publishTime,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ series: data });
  } catch (error: any) {
    console.error('Error updating series:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update series.' },
      { status: 500 }
    );
  }
}

// DELETE a series by ID from Supabase
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Series ID is required.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('series')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting series:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete series.' },
      { status: 500 }
    );
  }
}