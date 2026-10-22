/** Public language metadata; provider credentials and voice IDs never belong here. */
export const SPEECH_LANGUAGES = {
  en: {
    name: "English", script: "Latin", pattern: /[A-Za-z]/,
    preview: "Hello. This is a sample of the platform guide voice.",
    platform_help: "Open My Learning to browse courses. Select a lesson to read its material and view available activities.",
    study_tip: "Take a short break between study sessions. Review key ideas, then practise explaining them in your own words.",
  },
  mr: {
    name: "Marathi", script: "Devanagari", pattern: /[\u0900-\u097f]/,
    preview: "नमस्कार. हा तुमच्या शिक्षण सहाय्यकाच्या आवाजाचा नमुना आहे.",
    platform_help: "अभ्यासक्रम पाहण्यासाठी माय लर्निंग उघडा. अभ्यास साहित्य वाचण्यासाठी एखादा धडा निवडा आणि उपलब्ध उपक्रम पाहा.",
    study_tip: "अभ्यास करताना अधूनमधून थोडी विश्रांती घ्या. महत्त्वाच्या मुद्द्यांची उजळणी करा आणि ते स्वतःच्या शब्दांत समजावून सांगण्याचा सराव करा.",
  },
  hi: {
    name: "Hindi", script: "Devanagari", pattern: /[\u0900-\u097f]/,
    preview: "नमस्ते। यह आपके शिक्षण सहायक की आवाज़ का नमूना है।",
    platform_help: "पाठ्यक्रम देखने के लिए माय लर्निंग खोलें। अध्ययन सामग्री और उपलब्ध गतिविधियाँ देखने के लिए कोई पाठ चुनें।",
    study_tip: "पढ़ाई के बीच छोटे विराम लें। मुख्य विचारों को दोहराएँ और उन्हें अपने शब्दों में समझाने का अभ्यास करें।",
  },
  es: {
    name: "Spanish", script: "Latin", pattern: /[A-Za-z\u00c0-\u024f]/,
    preview: "Hola. Esta es una muestra de la voz de tu asistente de aprendizaje.",
    platform_help: "Abre My Learning para explorar los cursos. Selecciona una lección para leer el material y ver las actividades disponibles.",
    study_tip: "Haz una pausa breve entre sesiones de estudio. Repasa las ideas principales y practica explicarlas con tus propias palabras.",
  },
  ar: {
    name: "Arabic", script: "Arabic", pattern: /[\u0600-\u06ff]/,
    preview: "مرحباً. هذه عينة من صوت مساعدك التعليمي.",
    platform_help: "افتح قسم My Learning لاستعراض الدورات. اختر درساً لقراءة مواده والاطلاع على الأنشطة المتاحة.",
    study_tip: "خذ استراحة قصيرة بين جلسات الدراسة. راجع الأفكار الرئيسية وتدرّب على شرحها بكلماتك الخاصة.",
  },
  zh: {
    name: "Chinese", script: "simplified Chinese characters", pattern: /[\u3400-\u9fff]/,
    preview: "你好。这是你的学习助手的声音示例。",
    platform_help: "打开 My Learning 浏览课程。选择一节课，阅读学习资料并查看可用的学习活动。",
    study_tip: "在学习期间适当休息。复习重点，并练习用自己的话解释它们。",
  },
  pt: {
    name: "Portuguese", script: "Latin", pattern: /[A-Za-z\u00c0-\u024f]/,
    preview: "Olá. Esta é uma amostra da voz do seu assistente de aprendizagem.",
    platform_help: "Abra My Learning para explorar os cursos. Selecione uma aula para ler o material e ver as atividades disponíveis.",
    study_tip: "Faça uma breve pausa entre as sessões de estudo. Reveja as ideias principais e pratique explicá-las com suas próprias palavras.",
  },
  af: {
    name: "Afrikaans", script: "Latin", pattern: /[A-Za-z\u00c0-\u024f]/,
    preview: "Hallo. Dit is 'n voorbeeld van jou leerassistent se stem.",
    platform_help: "Maak My Learning oop om kursusse te sien. Kies 'n les om die studiemateriaal en beskikbare aktiwiteite te sien.",
    study_tip: "Neem kort pouses tussen studiesessies. Hersien die kernidees en oefen om dit in jou eie woorde te verduidelik.",
  },
} as const;

export type SpeechLanguage = keyof typeof SPEECH_LANGUAGES;

export function getSpeechLanguage(languages: string[]): SpeechLanguage | null {
  for (const language of languages) {
    const base = language.split("-")[0];
    if (Object.prototype.hasOwnProperty.call(SPEECH_LANGUAGES, base)) return base as SpeechLanguage;
  }
  return null;
}
