import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";
import { getWikimediaImage } from "./wikiService";

const SYSTEM_INSTRUCTION = `
You are a trivia game content generator for a game called "PopQuiz".
The goal is to generate fast-paced trivia where users TYPE the answer.

RULES:
1. **Bracket Logic**: The user input may contain brackets like "Pokemon(images)" or "History(easy)".
   - If "(images)" is present, 100% of questions MUST be 'image' type.
   
2. **Image Sourcing Strategy**:
   - For 'image' type questions, providing the **Correct Wikipedia Page Title** is critical.
   - **Pop Culture**: For characters, movies, or games, use the specific page title.
     - Use "Iron Man (character)" instead of "Iron Man".
     - Use "Avatar (2009 film)" instead of "Avatar".
     - Use "Vaporeon" (Unique enough).
   - **Brands**: Use the company name (e.g. "Coca-Cola").
   - **General**: Use the specific object name (e.g. "Eiffel Tower").
   - The system will use this title to fetch the official Wikipedia Infobox image.

3. **Ratio**: Unless "(images)" is specified, aim for ~35% 'image' type and ~65% 'text' type mix.

4. **Answers**: 
   - Must be SHORT (1-3 words max).
   - **Unique**: No repeating answers.
   - **Abbreviations**: Provide 'acceptedAnswers' for common aliases.
   - For image questions, ensure the 'answer' matches the image you expect to be found.

5. **Question Text**:
   - For image questions, ALWAYS provide 'questionText' (e.g. "Name this character", "What movie is this?", "Whose logo is this?").

6. **No Emojis**: Do not use emoji puzzles unless explicitly asked.
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
              content: { type: Type.STRING, description: "Precise Wikipedia Page Title (e.g. 'Mario (character)')" },
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
    
    // --- POST-PROCESSING: Resolve Images ---
    const resolvedQuestions = await Promise.all(questions.map(async (q) => {
        if (q.type === 'image') {
            const realUrl = await getWikimediaImage(q.content);
            
            if (realUrl) {
                // Success: We found a real, valid Wikimedia thumbnail
                return { ...q, content: realUrl };
            } else {
                // Fallback: AI Generation
                console.log(`[GeminiService] Wiki lookup failed for '${q.content}', using AI fallback.`);
                const prompt = q.questionText || q.answer;
                const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=400&nologo=true&seed=${Math.random()}`;
                return { ...q, content: aiUrl };
            }
        }
        return q;
    }));

    // Assign IDs and Shuffle
    const finalQuestions = resolvedQuestions.map((q, i) => ({ ...q, id: `${Date.now()}-${i}` }));
    return shuffleArray(finalQuestions);

  } catch (error) {
    console.error("Failed to generate questions:", error);
    return [];
  }
};