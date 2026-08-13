// Hook for accessing interview workflow state in a reusable way.
import { useMemo, useState } from 'react';

export default function useInterview() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState([]);

  const value = useMemo(
    () => ({
      currentQuestion,
      setCurrentQuestion,
      answers,
      setAnswers,
    }),
    [currentQuestion, answers],
  );

  return value;
}
