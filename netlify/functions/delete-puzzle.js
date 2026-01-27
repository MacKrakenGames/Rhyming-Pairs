const { createClient } = require("@supabase/supabase-js");

const BUCKET = "puzzleimages";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing Supabase configuration." })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: authData, error: authError } = await supabase.auth.getUser(
    token
  );
  if (authError || !authData?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  const adminAllowlist = (process.env.ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const userEmail = authData.user.email?.toLowerCase();
  if (!userEmail || !adminAllowlist.includes(userEmail)) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON." }) };
  }

  const puzzleId = body?.id;
  if (!puzzleId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing puzzle id." }) };
  }

  const { data: puzzle, error: fetchError } = await supabase
    .from("puzzles")
    .select("id,image_path")
    .eq("id", puzzleId)
    .single();

  if (fetchError || !puzzle) {
    return { statusCode: 404, body: JSON.stringify({ error: "Puzzle not found." }) };
  }

  const { error: storageError } = await supabase
    .storage
    .from(BUCKET)
    .remove([puzzle.image_path]);

  if (storageError) {
    return { statusCode: 500, body: JSON.stringify({ error: storageError.message }) };
  }

  const { error: deleteError } = await supabase
    .from("puzzles")
    .delete()
    .eq("id", puzzleId);

  if (deleteError) {
    return { statusCode: 500, body: JSON.stringify({ error: deleteError.message }) };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok" })
  };
};
