const { createClient } = require("@supabase/supabase-js");

const BUCKET = "puzzleimages";

exports.handler = async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing Supabase configuration." })
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from("puzzles")
    .select(
      "id,image_path,answer_1a,answer_1b,answer_2a,answer_2b,hints,publish_at"
    )
    .order("publish_at", { ascending: true });

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }

  const puzzles = (data || []).map((row) => ({
    id: row.id,
    img: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${row.image_path}`,
    answers: [
      [row.answer_1a, row.answer_1b],
      [row.answer_2a, row.answer_2b]
    ],
    hints: Array.isArray(row.hints) ? row.hints : [],
    publish_at: row.publish_at
  }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ puzzles })
  };
};
