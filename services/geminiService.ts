import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const SYSTEM_INSTRUCTION = `
You are a trivia game content generator for a game called "PopQuiz".
The goal is to generate fast-paced trivia where users TYPE the answer.
1. Questions must have SHORT answers (1-3 words max).
2. Answers must be easy to spell or commonly known.
3. **NO EMOJI PUZZLES.** Use only 'text' questions or 'image' questions.
4. **UNIQUE ANSWERS:** In the generated set, NO TWO QUESTIONS should have the same answer.
5. For 'image' type, use ONLY valid, public Wikimedia Commons URLs (ending in .jpg or .png). If you are unsure of the URL, use 'text' type.
6. Do not provide multiple choice options.
`;

export const generateQuestions = async (topic: string, count: number, existingAnswers: string[] = []): Promise<Question[]> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key missing");
    }

    const ai = new GoogleGenAI({ apiKey });

    // We cap the request to avoid token limits
    const safeCount = Math.min(count, 30); 

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate ${safeCount} trivia questions based on these themes: "${topic}". 
      Ensure answers are unique.
      The following answers have already been used, DO NOT generate questions with these answers: ${JSON.stringify(existingAnswers)}.
      Focus on general knowledge, pop culture, or the specific topic provided.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['text', 'image'] },
              content: { type: Type.STRING, description: "The question text OR the image URL" },
              answer: { type: Type.STRING, description: "The correct answer string (1-3 words)" },
              category: { type: Type.STRING }
            },
            required: ['id', 'type', 'content', 'answer']
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];

    const questions = JSON.parse(text) as Question[];
    // Ensure IDs are unique client-side just in case
    return questions.map((q, i) => ({ ...q, id: `${Date.now()}-${i}` }));

  } catch (error) {
    console.error("Failed to generate questions:", error);
    // Return empty array so the game handles it gracefully (maybe tries again later)
    return [];
  }
};