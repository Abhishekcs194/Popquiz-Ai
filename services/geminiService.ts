import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const SYSTEM_INSTRUCTION = `
You are a trivia game content generator for a game called "PopQuiz".
The goal is to generate fast-paced trivia where users TYPE the answer.

RULES:
1. **Ratio**: Roughly 35% of questions MUST be 'image' type, 65% 'text' type.
2. **Images**: Use ONLY valid, public Wikimedia Commons URLs (ending in .jpg or .png). If you cannot find a high-confidence image, use text.
3. **Answers**: Must be SHORT (1-3 words max), easy to spell, or commonly known.
4. **Uniqueness**: No repeating answers.
5. **No Emojis**: Do not use emoji puzzles.
6. **No Multiple Choice**: Just the question and the answer.
`;

// Fisher-Yates Shuffle
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

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
      
      CRITICAL INSTRUCTION: 
      - Provide approximately ${Math.floor(safeCount * 0.35)} 'image' questions and ${Math.ceil(safeCount * 0.65)} 'text' questions.
      - If multiple topics are listed, generate questions for ALL of them.
      
      Existing answers to avoid: ${JSON.stringify(existingAnswers)}.`,
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
              content: { type: Type.STRING, description: "The question text OR the Wikimedia image URL" },
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

    let questions = JSON.parse(text) as Question[];
    
    // Assign IDs and Shuffle strictly to mix topics
    questions = questions.map((q, i) => ({ ...q, id: `${Date.now()}-${i}` }));
    return shuffleArray(questions);

  } catch (error) {
    console.error("Failed to generate questions:", error);
    return [];
  }
};