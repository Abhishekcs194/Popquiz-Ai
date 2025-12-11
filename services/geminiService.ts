import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const SYSTEM_INSTRUCTION = `
You are a trivia game content generator for a game called "PopQuiz".
The goal is to generate fast-paced trivia where users TYPE the answer.

RULES:
1. **Bracket Logic**: The user input may contain brackets like "Pokemon(images)" or "History(easy)".
   - If "(images)" is present, 100% of questions MUST be 'image' type.
   
2. **Image Sourcing Priority**:
   - **PRIORITY 1 (Real Images)**: You MUST try to use a valid, stable, public domain **Wikimedia Commons URL** (ending in .jpg, .png) if you are 90% confident it exists.
   - **IMPORTANT**: Choose the "Thumb" version of the URL if possible (e.g., contains '/thumb/'), or a file that is likely small.
   - **PRIORITY 2 (AI Generation)**: ONLY as a last resort (if no real image is found), use the pollinations.ai format: "https://image.pollinations.ai/prompt/{description}?width=400&height=400&nologo=true". 
   - **NOTE**: The AI image URL width is set to 400 for speed. Do not increase it.
   - **Text Prompt**: For image questions, you MUST provide a 'questionText' field (e.g., "What movie scene is this?", "Who is this historical figure?", "What logo is this?").

3. **Ratio**: Unless "(images)" is specified, aim for ~35% 'image' type and ~65% 'text' type mix.

4. **Answers**: 
   - Must be SHORT (1-3 words max).
   - **Unique**: No repeating answers.
   - **Abbreviations**: Provide 'acceptedAnswers' for common aliases.

5. **No Emojis**: Do not use emoji puzzles unless explicitly asked.
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
              content: { type: Type.STRING, description: "Wikimedia Commons URL (Preferred) or Pollinations AI URL" },
              questionText: { type: Type.STRING, description: "The question to ask above the image" },
              answer: { type: Type.STRING, description: "The primary correct answer" },
              acceptedAnswers: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
              },
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