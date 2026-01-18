const Busboy = require("busboy");
const { createClient } = require("@supabase/supabase-js");

const BUCKET = "puzzleimages";

function buildFilePath(publishAt, filename) {
  const date = new Date(publishAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid publish_at date.");
  }
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const rawName = typeof filename === "string" && filename ? filename : "puzzle.jpg";
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${y}-${m}-${d}/${Date.now()}-${safeName}`;
}

async function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let fileBuffer = null;
    let fileInfo = null;
    const busboy = Busboy({
      headers: event.headers
    });

    busboy.on("file", (fieldname, file, info, encoding, mimetype) => {
      const buffers = [];
      const filename = typeof info === "string" ? info : info?.filename;
      const fileType = typeof info === "string" ? mimetype : info?.mimeType;
      file.on("data", (data) => buffers.push(data));
      file.on("end", () => {
        fileBuffer = Buffer.concat(buffers);
        fileInfo = { filename, mimetype: fileType };
      });
    });

    busboy.on("field", (fieldname, value) => {
      fields[fieldname] = value;
    });

    busboy.on("error", reject);
    busboy.on("finish", () => resolve({ fields, fileBuffer, fileInfo }));

    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "utf8");
    busboy.end(body);
  });
}

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

  let parsed;
  try {
    parsed = await parseMultipart(event);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid form data." })
    };
  }

  const { fields, fileBuffer, fileInfo } = parsed;
  if (!fileBuffer || !fileInfo) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing file." }) };
  }

  const answerFields = ["answer_1a", "answer_1b", "answer_2a", "answer_2b"];
  const missingAnswers = answerFields.filter((field) => !fields[field]?.trim());
  if (missingAnswers.length > 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing answer fields." })
    };
  }

  const publishAt = fields.publish_at;
  if (!publishAt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing publish_at date." })
    };
  }

  let filePath;
  try {
    filePath = buildFilePath(publishAt, fileInfo.filename || "puzzle.jpg");
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }

  const uploadResult = await supabase.storage
    .from(BUCKET)
    .upload(filePath, fileBuffer, {
      contentType: fileInfo.mimetype || "application/octet-stream",
      upsert: false
    });

  if (uploadResult.error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: uploadResult.error.message })
    };
  }

  const hints = fields.hints
    ? fields.hints
        .split("\n")
        .map((hint) => hint.trim())
        .filter(Boolean)
    : [];

  const insertResult = await supabase.from("puzzles").insert({
    image_path: filePath,
    answer_1a: fields.answer_1a.trim(),
    answer_1b: fields.answer_1b.trim(),
    answer_2a: fields.answer_2a.trim(),
    answer_2b: fields.answer_2b.trim(),
    hints,
    publish_at: publishAt
  });

  if (insertResult.error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: insertResult.error.message })
    };
  }

  const imageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${filePath}`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl })
  };
};
