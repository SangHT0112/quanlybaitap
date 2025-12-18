// Load Gemini API keys từ environment variables
const GEMINI_API_KEYS = [
  process.env.GOOGLE_API_KEY_1,
  process.env.GOOGLE_API_KEY_2,
  process.env.GOOGLE_API_KEY_3,
  process.env.GOOGLE_API_KEY_4,
  process.env.GOOGLE_API_KEY_5,
].filter(key => key && key !== 'xxx'); // Lọc bỏ key không hợp lệ
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

// Helper function để gửi yêu cầu API với cơ chế failover
export const fetchWithFailover = async (body) => {
  for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
    const apiKey = GEMINI_API_KEYS[i];
    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        // console.log(`✅ API call succeeded with key ${i + 1}`);
        return await response.json();
      } else {
        const errorText = await response.text();
        console.warn(`⚠️ API key ${i + 1} failed with status ${response.status}: ${errorText}`);
        continue;
      }
    } catch (error) {
      console.warn(`⚠️ Error with API key ${i + 1}: ${error.message}`);
      continue;
    }
  }
  throw new Error("Tất cả các khóa API Gemini đều thất bại hoặc đã hết hạn");
};
