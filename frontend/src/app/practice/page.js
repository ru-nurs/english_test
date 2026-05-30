"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiRequest,
  clearAuthSession,
  getBackendUrl,
  setAuthSession,
} from "@/lib/api";

const STAGES = {
  PREP: "prep",
  RECORD: "record",
  TASK_RESULT: "taskResult",
  FINAL_RESULT: "finalResult",
};

const PRACTICE_MODES = {
  VARIANT: "variant",
  TASK: "task",
};

const TASK_OPTIONS = [
  { id: 1, title: "Задание 1", description: "Чтение текста вслух" },
  { id: 2, title: "Задание 2", description: "Ответы на вопросы опроса" },
  { id: 3, title: "Задание 3", description: "Монолог по теме" },
];

function createAnswerState() {
  return {
    blob: null,
    url: "",
  };
}

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function roundOne(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function resolveMediaUrl(backendUrl, maybeRelativeUrl) {
  const src = String(maybeRelativeUrl || "").trim();
  if (!src) {
    return "";
  }
  if (/^https?:\/\//i.test(src)) {
    return src;
  }
  return `${backendUrl}${src}`;
}

function compactUnique(items, limit = 6) {
  const source = Array.isArray(items) ? items : [];
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const text = String(item || "").trim();
    if (!text) {
      continue;
    }
    if (seen.has(text.toLowerCase())) {
      continue;
    }
    seen.add(text.toLowerCase());
    result.push(text);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function normalizeAiErrorMessage(message) {
  const source = String(message || "").trim();
  const lower = source.toLowerCase();
  if (!source) {
    return "Не удалось выполнить AI-проверку.";
  }
  if (lower.includes("pro subscription required")) {
    return "AI-проверка доступна только для PRO-пользователей.";
  }
  if (lower.includes("authentication required")) {
    return "Для AI-проверки нужно войти в аккаунт.";
  }
  if (lower.includes("rate limit")) {
    return "Превышен лимит AI-провайдера. Подождите и попробуйте снова.";
  }
  return source;
}

function toAiTaskFeedback(rawResult, transcript = "", fallbackScore = 0) {
  const result = rawResult || {};
  return {
    score: roundOne(result.score ?? fallbackScore),
    contentScore: roundOne(result.content_score ?? fallbackScore),
    grammarScore: roundOne(result.grammar_score ?? fallbackScore),
    errors: compactUnique(result.errors || [], 8),
    recommendations: compactUnique(result.recommendations || [], 8),
    improvedAnswer: String(result.improved_answer || "").trim(),
    transcript: String(transcript || "").trim(),
  };
}

function TaskStepper({ currentTask, currentStage }) {
  const steps = [
    { id: 1, label: "Задание 1" },
    { id: 2, label: "Задание 2" },
    { id: 3, label: "Задание 3" },
  ];

  const doneByTask = {
    1: currentTask > 1 || currentStage === STAGES.FINAL_RESULT,
    2: currentTask > 2 || currentStage === STAGES.FINAL_RESULT,
    3: currentStage === STAGES.FINAL_RESULT,
  };

  return (
    <div className="training-stepper">
      {steps.map((step, index) => {
        const isActive = currentTask === step.id && currentStage !== STAGES.FINAL_RESULT;
        const isDone = doneByTask[step.id];
        const stateClass = isDone ? "done" : isActive ? "active" : "inactive";
        const labelClass = isDone || isActive ? "active" : "";

        return (
          <div key={step.id} className="training-step-block">
            <div className="training-step-block-inner">
              <div className={`training-step-circle ${stateClass}`}>{isDone ? "\u2713" : step.id}</div>
              {index < steps.length - 1 && (
                <div className={`training-step-line ${isDone ? "done" : ""}`} />
              )}
            </div>
            <div className={`training-step-label ${labelClass}`}>{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function StageStepper({ currentStage }) {
  const stageOrder = [STAGES.PREP, STAGES.RECORD, STAGES.TASK_RESULT];
  const labels = {
    [STAGES.PREP]: "Подготовка",
    [STAGES.RECORD]: "Запись ответа",
    [STAGES.TASK_RESULT]: "Результат",
  };

  const activeIndex = stageOrder.indexOf(currentStage);

  return (
    <div className="training-stage-stepper">
      {stageOrder.map((stage, index) => {
        const isDone = index < activeIndex;
        const isActive = index === activeIndex;
        return (
          <span
            key={stage}
            className={`training-stage-pill ${isDone ? "done" : isActive ? "active" : ""}`}
          >
            {labels[stage]}
          </span>
        );
      })}
    </div>
  );
}

function AudioLine({ backendUrl, src, label = "Эталонное аудио" }) {
  const audioSrc = resolveMediaUrl(backendUrl, src);

  return (
    <div className="reference-audio-row">
      <span>{label}</span>
      {audioSrc ? (
        <audio controls src={audioSrc} />
      ) : (
        <em>аудио пока не добавлено</em>
      )}
    </div>
  );
}

function ReferencePanel({ backendUrl, title = "Эталон", text, audioUrl, showText = true }) {
  const hasText = showText && Boolean(String(text || "").trim());

  return (
    <div className="reference-panel">
      <div className="reference-audio-body">
        <AudioLine backendUrl={backendUrl} src={audioUrl} />
      </div>
      {showText && (
        <details>
          <summary>{title}</summary>
          <div className="reference-panel-body">
            {hasText ? (
              <p className="reference-text">{text}</p>
            ) : (
              <p className="exam-subtle">Эталонный текст пока не добавлен.</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function AiFeedbackBlock({ feedback, title = "AI-разбор" }) {
  if (!feedback) {
    return null;
  }

  return (
    <div className="ai-feedback-box">
      <p className="task2-result-title">
        {title}: {roundOne(feedback.score || 0).toFixed(1)} / 5
      </p>
      <div className="ai-score-row">
        <span>Содержание: {roundOne(feedback.contentScore || 0).toFixed(1)}</span>
        <span>Грамматика: {roundOne(feedback.grammarScore || 0).toFixed(1)}</span>
      </div>
      {feedback.recommendations?.length > 0 ? (
        <ul className="ai-feedback-list">
          {feedback.recommendations.map((item, index) => (
            <li key={`rec-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="exam-subtle">Рекомендаций пока нет.</p>
      )}
      {feedback.errors?.length > 0 && (
        <p className="exam-subtle mt-2">Ошибки: {feedback.errors.join("; ")}</p>
      )}
      {feedback.improvedAnswer && (
        <p className="exam-subtle mt-2">
          Пример лучше: <span className="reference-inline">{feedback.improvedAnswer}</span>
        </p>
      )}
    </div>
  );
}

export default function PracticePage() {
  const backendUrl = getBackendUrl();

  const [user, setUser] = useState(null);
  const [tests, setTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState("");
  const [practiceMode, setPracticeMode] = useState(PRACTICE_MODES.VARIANT);
  const [selectedTaskNumber, setSelectedTaskNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [aiEvaluating, setAiEvaluating] = useState(false);
  const [aiProgress, setAiProgress] = useState("");
  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiAutoAttempted, setAiAutoAttempted] = useState(false);
  const [aiAutoTaskAttempts, setAiAutoTaskAttempts] = useState({});

  const [currentTask, setCurrentTask] = useState(1);
  const [currentStage, setCurrentStage] = useState(STAGES.PREP);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  const [task1Answer, setTask1Answer] = useState(createAnswerState());
  const [task2Answers, setTask2Answers] = useState([]);
  const [task3Answer, setTask3Answer] = useState(createAnswerState());

  const [recordingTarget, setRecordingTarget] = useState("");

  const stageTimerRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const stopHandlerRef = useRef(null);
  const afterStopActionRef = useRef(null);
  const recordingTargetRef = useRef("");

  const selectedTest = useMemo(
    () => tests.find((test) => test.id === selectedTestId) || null,
    [tests, selectedTestId]
  );
  const selectedTestIndex = useMemo(
    () => tests.findIndex((test) => test.id === selectedTestId),
    [tests, selectedTestId]
  );
  const isTaskTrainingMode = practiceMode === PRACTICE_MODES.TASK;

  const task2Questions = selectedTest?.tasks?.task2?.questions || [];
  const task2QuestionCount = task2Questions.length;
  const currentQuestion = task2Questions[activeQuestionIndex] || null;

  const task1Completed = Boolean(task1Answer.blob);
  const task2AnsweredCount = task2Answers.filter((item) => item.blob).length;
  const task3Completed = Boolean(task3Answer.blob);
  const hasCurrentTaskAnswer =
    currentTask === 1
      ? task1Completed
      : currentTask === 2
        ? task2AnsweredCount > 0
        : task3Completed;

  const task1Score = task1Completed ? 5 : 0;
  const task2Score = task2QuestionCount > 0 ? roundOne((task2AnsweredCount / task2QuestionCount) * 5) : 0;
  const task3Score = task3Completed ? 5 : 0;
  const overallScore = roundOne((task1Score + task2Score + task3Score) / 3);
  const canUseAi = Boolean(user && (user.isPro || user.role === "admin"));
  const hasRecordedAnswers = task1Completed || task2AnsweredCount > 0 || task3Completed;

  const displayedScores = aiFeedback?.taskScores || {
    task1: task1Score,
    task2: task2Score,
    task3: task3Score,
  };
  const displayedOverallScore = aiFeedback?.overallScore ?? overallScore;
  const currentTaskFeedback = aiFeedback?.[`task${currentTask}`] || null;

  const clearStageTimer = useCallback(() => {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const stopRecordingWithAction = useCallback(
    (action) => {
      if (!recordingTargetRef.current) {
        if (typeof action === "function") {
          action();
        }
        return;
      }

      afterStopActionRef.current = typeof action === "function" ? action : null;
      stopRecording();
    },
    [stopRecording]
  );

  const replaceAnswerBlob = useCallback((prevState, blob) => {
    if (prevState.url) {
      URL.revokeObjectURL(prevState.url);
    }
    if (!blob) {
      return createAnswerState();
    }
    return {
      blob,
      url: URL.createObjectURL(blob),
    };
  }, []);

  const startRecording = useCallback(
    async ({ targetKey, onDone }) => {
      setError("");

      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        setError("Ваш браузер не поддерживает запись аудио.");
        return;
      }

      if (recordingTargetRef.current) {
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const mimeType = "audio/webm;codecs=opus";
        const options = MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : {};
        const recorder = new MediaRecorder(stream, options);

        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        stopHandlerRef.current = typeof onDone === "function" ? onDone : null;
        recorder.onstop = () => {
          stopStream();
          setRecordingTarget("");
          recordingTargetRef.current = "";
          recorderRef.current = null;

          const blob =
            chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: "audio/webm" }) : null;

          if (blob && typeof stopHandlerRef.current === "function") {
            stopHandlerRef.current(blob);
          }
          stopHandlerRef.current = null;

          const action = afterStopActionRef.current;
          afterStopActionRef.current = null;
          if (typeof action === "function") {
            action();
          }
        };

        recorder.start();
        recorderRef.current = recorder;
        setRecordingTarget(targetKey);
        recordingTargetRef.current = targetKey;
      } catch (startError) {
        stopStream();
        setRecordingTarget("");
        recordingTargetRef.current = "";
        setError("Не удалось получить доступ к микрофону. Разрешите доступ и повторите.");
      }
    },
    [stopStream]
  );

  const resetAllAnswers = useCallback(
    (test) => {
      setTask1Answer((prev) => replaceAnswerBlob(prev, null));
      setTask3Answer((prev) => replaceAnswerBlob(prev, null));

      setTask2Answers((prev) => {
        prev.forEach((item) => {
          if (item.url) {
            URL.revokeObjectURL(item.url);
          }
        });

        const count = test?.tasks?.task2?.questions?.length || 0;
        return Array.from({ length: count }, () => createAnswerState());
      });
    },
    [replaceAnswerBlob]
  );

  const loadPracticeData = useCallback(async () => {
    try {
      try {
        const meData = await apiRequest("/api/auth/me");
        setUser(meData.user || null);
        setAuthSession({ user: meData.user || null });
      } catch (meError) {
        clearAuthSession();
        setUser(null);
      }

      const testsData = await apiRequest("/api/tests");
      const loadedTests = testsData.tests || [];
      setTests(loadedTests);
      if (loadedTests[0]) {
        setSelectedTestId(loadedTests[0].id);
      }
    } catch (loadError) {
      setError(loadError.message || "Не удалось загрузить варианты.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPracticeData();

    return () => {
      clearStageTimer();
      stopHandlerRef.current = null;
      afterStopActionRef.current = null;
      stopRecording();
      stopStream();
    };
  }, [clearStageTimer, loadPracticeData, stopRecording, stopStream]);

  useEffect(() => {
    recordingTargetRef.current = recordingTarget;
  }, [recordingTarget]);

  useEffect(() => {
    if (!selectedTest) {
      return;
    }

    clearStageTimer();
    stopHandlerRef.current = null;
    afterStopActionRef.current = null;
    stopRecording();
    stopStream();

    resetAllAnswers(selectedTest);
    setCurrentTask(isTaskTrainingMode ? selectedTaskNumber : 1);
    setCurrentStage(STAGES.PREP);
    setActiveQuestionIndex(0);
    setTimeLeft(0);
    setInfo("");
    setError("");
    setAiFeedback(null);
    setAiProgress("");
    setAiEvaluating(false);
    setAiAutoAttempted(false);
    setAiAutoTaskAttempts({});
  }, [
    clearStageTimer,
    isTaskTrainingMode,
    resetAllAnswers,
    selectedTaskNumber,
    selectedTest,
    stopRecording,
    stopStream,
  ]);

  const completeRecordStage = useCallback(() => {
    if (currentTask === 1 || currentTask === 3) {
      setCurrentStage(STAGES.TASK_RESULT);
      return;
    }

    if (task2QuestionCount === 0) {
      setCurrentStage(STAGES.TASK_RESULT);
      return;
    }

    setActiveQuestionIndex((prev) => {
      const isLast = prev >= task2QuestionCount - 1;
      if (isLast) {
        setCurrentStage(STAGES.TASK_RESULT);
        return prev;
      }
      return prev + 1;
    });
  }, [currentTask, task2QuestionCount]);

  const handleRecordTimeout = useCallback(() => {
    stopRecordingWithAction(() => {
      completeRecordStage();
    });
  }, [completeRecordStage, stopRecordingWithAction]);

  useEffect(() => {
    clearStageTimer();

    if (!selectedTest) {
      return undefined;
    }

    if (currentStage !== STAGES.PREP && currentStage !== STAGES.RECORD) {
      setTimeLeft(0);
      return undefined;
    }

    const prepSeconds =
      currentTask === 1
        ? selectedTest.tasks.task1.prepSeconds
        : currentTask === 2
          ? selectedTest.tasks.task2.prepSeconds || 90
          : selectedTest.tasks.task3.prepSeconds;

    const recordSeconds =
      currentTask === 1
        ? selectedTest.tasks.task1.maxRecordSeconds
        : currentTask === 2
          ? selectedTest.tasks.task2.maxAnswerSeconds
          : selectedTest.tasks.task3.maxRecordSeconds;

    const initialSeconds = currentStage === STAGES.PREP ? prepSeconds : recordSeconds;
    let seconds = Math.max(0, Number(initialSeconds) || 0);
    setTimeLeft(seconds);

    if (seconds <= 0) {
      if (currentStage === STAGES.PREP) {
        setCurrentStage(STAGES.RECORD);
      } else {
        handleRecordTimeout();
      }
      return undefined;
    }

    stageTimerRef.current = setInterval(() => {
      seconds -= 1;
      setTimeLeft(Math.max(0, seconds));

      if (seconds <= 0) {
        clearStageTimer();
        if (currentStage === STAGES.PREP) {
          setCurrentStage(STAGES.RECORD);
        } else {
          handleRecordTimeout();
        }
      }
    }, 1000);

    return clearStageTimer;
  }, [clearStageTimer, currentStage, currentTask, handleRecordTimeout, selectedTest]);

  const goToTask = useCallback((taskNumber) => {
    setCurrentTask(taskNumber);
    setCurrentStage(STAGES.PREP);
    if (taskNumber === 2) {
      setActiveQuestionIndex(0);
    }
  }, []);

  const restartCurrentTask = useCallback(() => {
    if (currentTask === 1) {
      setTask1Answer((prev) => replaceAnswerBlob(prev, null));
    } else if (currentTask === 2) {
      setTask2Answers((prev) => {
        prev.forEach((item) => {
          if (item.url) {
            URL.revokeObjectURL(item.url);
          }
        });
        return Array.from({ length: task2QuestionCount }, () => createAnswerState());
      });
      setActiveQuestionIndex(0);
    } else {
      setTask3Answer((prev) => replaceAnswerBlob(prev, null));
    }

    setCurrentStage(STAGES.PREP);
  }, [currentTask, replaceAnswerBlob, task2QuestionCount]);

  const handleMicToggle = useCallback(() => {
    if (currentStage !== STAGES.RECORD) {
      return;
    }

    if (recordingTargetRef.current) {
      stopRecording();
      return;
    }

    if (currentTask === 1) {
      startRecording({
        targetKey: "task1",
        onDone: (blob) => setTask1Answer((prev) => replaceAnswerBlob(prev, blob)),
      });
      return;
    }

    if (currentTask === 2) {
      if (!currentQuestion) {
        setError("Для этого варианта не найден текущий вопрос задания 2.");
        return;
      }
      const questionIndex = activeQuestionIndex;
      startRecording({
        targetKey: `task2-q${questionIndex + 1}`,
        onDone: (blob) =>
          setTask2Answers((prev) =>
            prev.map((item, index) => (index === questionIndex ? replaceAnswerBlob(item, blob) : item))
          ),
      });
      return;
    }

    startRecording({
      targetKey: "task3",
      onDone: (blob) => setTask3Answer((prev) => replaceAnswerBlob(prev, blob)),
    });
  }, [
    activeQuestionIndex,
    currentQuestion,
    currentStage,
    currentTask,
    replaceAnswerBlob,
    startRecording,
    stopRecording,
  ]);

  const handlePrepBack = () => {
    if (isTaskTrainingMode) {
      moveTaskTrainingVariant(-1);
      return;
    }
    if (currentTask === 1) {
      return;
    }
    goToTask(Math.max(1, currentTask - 1));
  };

  const handleRecordBack = () => {
    stopRecordingWithAction(() => {
      if (currentTask === 2) {
        if (activeQuestionIndex === 0) {
          setCurrentStage(STAGES.PREP);
          return;
        }
        setActiveQuestionIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      setCurrentStage(STAGES.PREP);
    });
  };

  const handleRecordNext = () => {
    stopRecordingWithAction(() => {
      completeRecordStage();
    });
  };

  const handleTaskResultContinue = () => {
    if (isTaskTrainingMode) {
      setCurrentStage(STAGES.PREP);
      return;
    }
    if (currentTask === 1) {
      goToTask(2);
      return;
    }
    if (currentTask === 2) {
      goToTask(3);
      return;
    }
    setCurrentStage(STAGES.FINAL_RESULT);
  };

  const startNewVariant = () => {
    if (!selectedTest) {
      return;
    }
    resetAllAnswers(selectedTest);
    setCurrentTask(isTaskTrainingMode ? selectedTaskNumber : 1);
    setCurrentStage(STAGES.PREP);
    setActiveQuestionIndex(0);
    setInfo("");
    setError("");
    setAiFeedback(null);
    setAiProgress("");
    setAiEvaluating(false);
    setAiAutoAttempted(false);
    setAiAutoTaskAttempts({});
  };

  const selectPracticeMode = (mode) => {
    stopRecordingWithAction(() => {
      setPracticeMode(mode);
      setCurrentTask(mode === PRACTICE_MODES.TASK ? selectedTaskNumber : 1);
      setCurrentStage(STAGES.PREP);
      setActiveQuestionIndex(0);
      setInfo("");
      setError("");
      setAiFeedback(null);
      setAiAutoAttempted(false);
      setAiAutoTaskAttempts({});
      if (selectedTest) {
        resetAllAnswers(selectedTest);
      }
    });
  };

  const selectTaskTrainingNumber = (taskNumber) => {
    stopRecordingWithAction(() => {
      setPracticeMode(PRACTICE_MODES.TASK);
      setSelectedTaskNumber(taskNumber);
      setCurrentTask(taskNumber);
      setCurrentStage(STAGES.PREP);
      setActiveQuestionIndex(0);
      setInfo("");
      setError("");
      setAiFeedback(null);
      setAiAutoAttempted(false);
      setAiAutoTaskAttempts({});
      if (selectedTest) {
        resetAllAnswers(selectedTest);
      }
    });
  };

  const selectTrainingTest = (testId) => {
    stopRecordingWithAction(() => {
      setSelectedTestId(testId);
    });
  };

  const moveTaskTrainingVariant = (direction) => {
    if (!tests.length || selectedTestIndex < 0) {
      return;
    }

    const nextIndex = Math.min(
      tests.length - 1,
      Math.max(0, selectedTestIndex + direction)
    );
    const nextTest = tests[nextIndex];
    if (nextTest) {
      selectTrainingTest(nextTest.id);
    }
  };

  const transcribeAnswerBlob = useCallback(async (blob, fileName) => {
    const formData = new FormData();
    formData.append("audio", blob, fileName || "answer.webm");
    const data = await apiRequest("/api/transcribe", {
      method: "POST",
      body: formData,
      isFormData: true,
    });
    return String(data.text || "").trim();
  }, []);

  const evaluateTranscript = useCallback(async ({ taskType, promptContext, referenceText, userText }) => {
    return apiRequest("/api/evaluate", {
      method: "POST",
      body: {
        taskType,
        promptContext,
        referenceText,
        userText,
      },
    });
  }, []);

  const runAiEvaluation = useCallback(async ({ onlyTask = null } = {}) => {
    if (!selectedTest) {
      return;
    }
    if (!canUseAi) {
      setError("AI-проверка доступна только после входа в PRO-аккаунт.");
      return;
    }
    const targetTasks = onlyTask ? [onlyTask] : [1, 2, 3];
    const hasTargetAnswer =
      (!onlyTask && hasRecordedAnswers) ||
      (onlyTask === 1 && task1Answer.blob) ||
      (onlyTask === 2 && task2AnsweredCount > 0) ||
      (onlyTask === 3 && task3Answer.blob);

    if (!hasTargetAnswer) {
      setError("Сначала запишите ответ, затем запустите AI-проверку.");
      return;
    }

    const shouldAbortBatch = (message) => {
      const lower = String(message || "").toLowerCase();
      return (
        lower.includes("rate limit") ||
        lower.includes("authentication required") ||
        lower.includes("pro subscription required")
      );
    };

    setAiEvaluating(true);
    setAiProgress("Запускаем AI-проверку...");
    setError("");
    setInfo("");

    try {
      let task1Feedback = onlyTask ? aiFeedback?.task1 || toAiTaskFeedback(null, "", task1Score) : toAiTaskFeedback(null, "", 0);
      let task2Feedback = onlyTask ? aiFeedback?.task2 || toAiTaskFeedback(null, "", task2Score) : toAiTaskFeedback(null, "", 0);
      let task3Feedback = onlyTask ? aiFeedback?.task3 || toAiTaskFeedback(null, "", task3Score) : toAiTaskFeedback(null, "", 0);
      let task1Proof = aiFeedback?.evaluationProof?.task1 || "";
      let task2Proof = aiFeedback?.evaluationProof?.task2 || [];
      let task3Proof = aiFeedback?.evaluationProof?.task3 || "";

      if (targetTasks.includes(1) && task1Answer.blob) {
        setAiProgress("AI: проверяем задание 1...");
        const transcript = await transcribeAnswerBlob(task1Answer.blob, "task1.webm");
        const evalResult = await evaluateTranscript({
          taskType: "task1",
          promptContext: selectedTest.tasks.task1.readingText || selectedTest.tasks.task1.title || "Read aloud",
          referenceText: selectedTest.tasks.task1.referenceText || selectedTest.tasks.task1.readingText || "",
          userText: transcript,
        });
        task1Feedback = toAiTaskFeedback(evalResult, transcript, 0);
        task1Proof = String(evalResult?.evaluationProof || "");
      }

      const questionFeedback = [];
      const questions = selectedTest.tasks.task2.questions || [];
      if (targetTasks.includes(2)) {
        for (let index = 0; index < questions.length; index += 1) {
        const question = questions[index];
        const answer = task2Answers[index];
        if (!answer?.blob) {
          questionFeedback.push({
            questionIndex: index + 1,
            questionText: question.text || "",
            answered: false,
            ...toAiTaskFeedback(null, "", 0),
          });
          continue;
        }

        setAiProgress(`AI: задание 2, вопрос ${index + 1}/${questions.length}...`);

        try {
          const transcript = await transcribeAnswerBlob(answer.blob, `task2-q${index + 1}.webm`);
          const evalResult = await evaluateTranscript({
            taskType: "task2",
            promptContext: question.text || `Question ${index + 1}`,
            referenceText: question.referenceText || "",
            userText: transcript,
          });
          questionFeedback.push({
            questionIndex: index + 1,
            questionText: question.text || "",
            answered: true,
            evaluationProof: String(evalResult?.evaluationProof || ""),
            ...toAiTaskFeedback(evalResult, transcript, 0),
          });
        } catch (questionError) {
          const normalizedMessage = normalizeAiErrorMessage(questionError.message || "");
          if (shouldAbortBatch(normalizedMessage)) {
            throw new Error(normalizedMessage);
          }
          questionFeedback.push({
            questionIndex: index + 1,
            questionText: question.text || "",
            answered: true,
            failed: true,
            failureReason: normalizedMessage,
            ...toAiTaskFeedback(null, "", 0),
          });
        }
      }

        const task2Count = questions.length || 1;
        const task2ScoreValue = roundOne(
          questionFeedback.reduce((sum, item) => sum + Number(item.score || 0), 0) / task2Count
        );
        const task2ContentValue = roundOne(
          questionFeedback.reduce((sum, item) => sum + Number(item.contentScore || 0), 0) / task2Count
        );
        const task2GrammarValue = roundOne(
          questionFeedback.reduce((sum, item) => sum + Number(item.grammarScore || 0), 0) / task2Count
        );
        task2Feedback = {
          score: task2ScoreValue,
          contentScore: task2ContentValue,
          grammarScore: task2GrammarValue,
          errors: compactUnique(questionFeedback.flatMap((item) => item.errors || []), 8),
          recommendations: compactUnique(
            questionFeedback.flatMap((item) => item.recommendations || []),
            8
          ),
          improvedAnswer: "",
          transcript: questionFeedback
            .filter((item) => item.transcript)
            .map((item) => `Q${item.questionIndex}: ${item.transcript}`)
            .join("\n"),
          questions: questionFeedback,
        };
        task2Proof = questionFeedback
          .map((item) => String(item.evaluationProof || ""))
          .filter(Boolean);
      }

      if (targetTasks.includes(3) && task3Answer.blob) {
        setAiProgress("AI: проверяем задание 3...");
        const transcript = await transcribeAnswerBlob(task3Answer.blob, "task3.webm");
        const evalResult = await evaluateTranscript({
          taskType: "task3",
          promptContext: `Topic: ${selectedTest.tasks.task3.topic || ""}. Plan: ${(selectedTest.tasks.task3.plan || []).join("; ")}`,
          referenceText: selectedTest.tasks.task3.referenceText || "",
          userText: transcript,
        });
        task3Feedback = toAiTaskFeedback(evalResult, transcript, 0);
        task3Proof = String(evalResult?.evaluationProof || "");
      }

      const evaluatedScores = {
        task1: roundOne(task1Feedback.score),
        task2: roundOne(task2Feedback.score),
        task3: roundOne(task3Feedback.score),
      };
      const evaluatedOverall = roundOne(
        (evaluatedScores.task1 + evaluatedScores.task2 + evaluatedScores.task3) / 3
      );

      setAiFeedback({
        checkedAt: new Date().toISOString(),
        task1: task1Feedback,
        task2: task2Feedback,
        task3: task3Feedback,
        taskScores: evaluatedScores,
        overallScore: evaluatedOverall,
        evaluationProof: {
          task1: task1Proof,
          task2: task2Proof,
          task3: task3Proof,
        },
        globalErrors: compactUnique(
          [...task1Feedback.errors, ...task2Feedback.errors, ...task3Feedback.errors],
          10
        ),
        globalRecommendations: compactUnique(
          [
            ...task1Feedback.recommendations,
            ...task2Feedback.recommendations,
            ...task3Feedback.recommendations,
          ],
          10
        ),
      });
      setInfo(
        onlyTask
          ? `AI-проверка задания ${onlyTask} завершена.`
          : `AI-проверка завершена. Итоговый AI-балл: ${evaluatedOverall.toFixed(1)} / 5`
      );
    } catch (evaluateError) {
      setError(normalizeAiErrorMessage(evaluateError.message || "Не удалось выполнить AI-проверку."));
    } finally {
      setAiEvaluating(false);
      setAiProgress("");
    }
  }, [
    canUseAi,
    aiFeedback,
    evaluateTranscript,
    hasRecordedAnswers,
    selectedTest,
    task1Answer.blob,
    task1Score,
    task2Answers,
    task2AnsweredCount,
    task2Score,
    task3Answer.blob,
    task3Score,
    transcribeAnswerBlob,
  ]);

  useEffect(() => {
    if (currentStage !== STAGES.FINAL_RESULT) {
      return;
    }
    if (!canUseAi || !hasRecordedAnswers) {
      return;
    }
    if (aiEvaluating || aiFeedback || aiAutoAttempted) {
      return;
    }
    setAiAutoAttempted(true);
    runAiEvaluation();
  }, [
    aiAutoAttempted,
    aiEvaluating,
    aiFeedback,
    canUseAi,
    currentStage,
    hasRecordedAnswers,
    runAiEvaluation,
  ]);

  useEffect(() => {
    if (currentStage !== STAGES.TASK_RESULT) {
      return;
    }
    if (!canUseAi || aiEvaluating || !hasCurrentTaskAnswer) {
      return;
    }

    const attemptKey = `${selectedTestId}:task${currentTask}`;
    if (aiAutoTaskAttempts[attemptKey]) {
      return;
    }

    setAiAutoTaskAttempts((prev) => ({ ...prev, [attemptKey]: true }));
    runAiEvaluation({ onlyTask: currentTask });
  }, [
    aiAutoTaskAttempts,
    aiEvaluating,
    canUseAi,
    currentStage,
    currentTask,
    hasCurrentTaskAnswer,
    runAiEvaluation,
    selectedTestId,
  ]);

  const saveAttempt = async () => {
    if (!user || !selectedTest) {
      setError("Для сохранения результата войдите в аккаунт.");
      return;
    }

    setSavingAttempt(true);
    setError("");
    setInfo("");

    try {
      const result = await apiRequest("/api/attempts", {
        method: "POST",
        body: {
          testId: selectedTest.id,
          evaluationProof: aiFeedback?.evaluationProof || null,
        },
      });
      setInfo(
        `Попытка сохранена. Итог: ${result.totalScore} / 5${
          result.scoreSource === "ai-proof" ? " (подтверждено AI)" : " (без верификации AI)"
        }`
      );
    } catch (saveError) {
      setError(saveError.message || "Не удалось сохранить попытку.");
    } finally {
      setSavingAttempt(false);
    }
  };

  const stageHeading =
    currentStage === STAGES.PREP
      ? "Подготовка"
      : currentStage === STAGES.RECORD
        ? "Запись ответа"
        : currentStage === STAGES.TASK_RESULT
          ? "Результат задания"
          : "Итог варианта";

  const taskLabel = `Задание ${currentTask}`;

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="page-wrap py-8">
          <div className="surface p-6">Загружаем варианты...</div>
        </div>
      </main>
    );
  }

  if (!selectedTest) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="page-wrap py-8">
          <div className="surface p-6">Пока нет доступных опубликованных вариантов.</div>
        </div>
      </main>
    );
  }

  const isRecordingCurrent =
    currentTask === 1
      ? recordingTarget === "task1"
      : currentTask === 2
        ? recordingTarget === `task2-q${activeQuestionIndex + 1}`
        : recordingTarget === "task3";

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="page-wrap py-8">
        <section className="surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-medium text-[var(--foreground)]">Тренировка в формате экзамена</h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {user
                  ? `Вы вошли как ${user.displayName || user.email}`
                  : "Гостевой режим. Для сохранения результата войдите в аккаунт."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedTestId}
                onChange={(event) => selectTrainingTest(event.target.value)}
                className="field max-w-xs text-sm"
              >
                {tests.map((test) => (
                  <option key={test.id} value={test.id}>
                    {test.title} [{test.access}]
                  </option>
                ))}
              </select>
              <button type="button" onClick={startNewVariant} className="btn btn-outline text-sm">
                Начать заново
              </button>
            </div>
          </div>

          <div className="training-flow-wrap">
            <div className="practice-mode-panel">
              <div className="practice-mode-tabs" aria-label="Режим тренировки">
                <button
                  type="button"
                  onClick={() => selectPracticeMode(PRACTICE_MODES.VARIANT)}
                  className={practiceMode === PRACTICE_MODES.VARIANT ? "active" : ""}
                >
                  Тренировка вариантов
                </button>
                <button
                  type="button"
                  onClick={() => selectPracticeMode(PRACTICE_MODES.TASK)}
                  className={practiceMode === PRACTICE_MODES.TASK ? "active" : ""}
                >
                  Тренировка по заданиям
                </button>
              </div>

              {isTaskTrainingMode && (
                <div className="task-training-tools">
                  <div className="task-choice-grid">
                    {TASK_OPTIONS.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => selectTaskTrainingNumber(task.id)}
                        className={`task-choice-card ${selectedTaskNumber === task.id ? "active" : ""}`}
                      >
                        <strong>{task.title}</strong>
                        <span>{task.description}</span>
                      </button>
                    ))}
                  </div>

                  <div className="task-variant-picker">
                    <button
                      type="button"
                      onClick={() => moveTaskTrainingVariant(-1)}
                      disabled={selectedTestIndex <= 0}
                      className="btn btn-outline text-sm"
                    >
                      Предыдущее
                    </button>
                    <select
                      value={selectedTestId}
                      onChange={(event) => selectTrainingTest(event.target.value)}
                      className="field text-sm"
                    >
                      {tests.map((test, index) => (
                        <option key={`task-pick-${test.id}`} value={test.id}>
                          #{index + 1} - {test.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => moveTaskTrainingVariant(1)}
                      disabled={selectedTestIndex >= tests.length - 1}
                      className="btn btn-outline text-sm"
                    >
                      Следующее
                    </button>
                  </div>

                  <div className="task-number-grid" aria-label={`Номера вариантов для задания ${selectedTaskNumber}`}>
                    {tests.map((test, index) => (
                      <button
                        key={`task-number-${test.id}`}
                        type="button"
                        onClick={() => selectTrainingTest(test.id)}
                        className={`task-number-button ${test.id === selectedTestId ? "active" : ""}`}
                        title={`${test.title} [${test.access}]`}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!isTaskTrainingMode && <TaskStepper currentTask={currentTask} currentStage={currentStage} />}

            {currentStage !== STAGES.FINAL_RESULT && <StageStepper currentStage={currentStage} />}

            {currentStage !== STAGES.FINAL_RESULT && (
              <article className="exam-card">
                <span className="exam-badge">{taskLabel}</span>
                <h2 className="exam-title">{stageHeading}</h2>

                {currentTask === 1 && (
                  <>
                    <p className="exam-description">
                      Прочитайте текст вслух. Старайтесь говорить ровно и внятно.
                    </p>
                    <p className="exam-text-passage">{selectedTest.tasks.task1.readingText}</p>
                  </>
                )}

                {currentTask === 2 && (
                  <>
                    <p className="exam-description">
                      Ответьте на вопросы последовательно, один вопрос за раз.
                    </p>
                    <p className="exam-subtle">
                      Вопрос {activeQuestionIndex + 1} из {task2QuestionCount}. Ответов записано:{" "}
                      {task2AnsweredCount}/{task2QuestionCount}
                    </p>

                    <div className="question-status-list">
                      {task2Answers.map((answer, index) => (
                        <button
                          key={`q-status-${index + 1}`}
                          type="button"
                          disabled={Boolean(recordingTarget)}
                          onClick={() => setActiveQuestionIndex(index)}
                          className={`question-status-pill ${
                            index === activeQuestionIndex
                              ? "active"
                              : answer.blob
                                ? "done"
                                : ""
                          }`}
                        >
                          В{index + 1}
                        </button>
                      ))}
                    </div>

                    {currentQuestion ? (
                      <div className="question-card">
                        <p className="question-card-label">Текущий вопрос</p>
                        <p className="question-card-text">{currentQuestion.text}</p>
                        {currentQuestion.audioUrl && (
                          <audio
                            controls
                            src={resolveMediaUrl(backendUrl, currentQuestion.audioUrl)}
                            className="mt-3"
                          />
                        )}
                        {task2Answers[activeQuestionIndex]?.url && (
                          <audio
                            controls
                            src={task2Answers[activeQuestionIndex].url}
                            className="mt-3"
                          />
                        )}
                      </div>
                    ) : (
                      <p className="exam-subtle">В этом варианте пока нет вопросов задания 2.</p>
                    )}
                  </>
                )}

                {currentTask === 3 && (
                  <>
                    <p className="exam-description">Подготовьте монолог по теме и следуйте плану.</p>
                    <div className="exam-topic-tag">Тема: {selectedTest.tasks.task3.topic}</div>
                    <ul className="exam-plan-list">
                      {selectedTest.tasks.task3.plan.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}

                {(currentStage === STAGES.PREP || currentStage === STAGES.RECORD) && (
                  <div className="exam-timer-block">
                    <div className="exam-timer-value">{formatSeconds(timeLeft)}</div>
                    <p className="exam-timer-label">
                      {currentStage === STAGES.PREP ? "Время на подготовку" : "Время на ответ"}
                    </p>
                  </div>
                )}

                {currentStage === STAGES.RECORD && (
                  <>
                    <div className={`recording-wave ${isRecordingCurrent ? "active" : ""}`}>
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                    </div>
                    <div className="exam-mic-wrap">
                      <button
                        type="button"
                        onClick={handleMicToggle}
                        className={`exam-mic-btn ${isRecordingCurrent ? "recording" : ""}`}
                        aria-label={isRecordingCurrent ? "Остановить запись" : "Начать запись"}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
                        </svg>
                      </button>
                    </div>
                    <p className="exam-subtle text-center">
                      {isRecordingCurrent ? "Идет запись. Нажмите на микрофон, чтобы остановить." : "Нажмите на микрофон, чтобы начать запись."}
                    </p>
                  </>
                )}

                {currentStage === STAGES.TASK_RESULT && (
                  <div className="task-result-box">
                    {aiEvaluating && (
                      <p className="status-warning rounded-xl p-3 text-sm">
                        {aiProgress || `AI проверяет задание ${currentTask}...`}
                      </p>
                    )}

                    {currentTask === 1 && (
                      <>
                        <p className="exam-subtle">
                          {task1Completed
                            ? "Ответ записан. Можно продолжать к следующему заданию."
                            : "Запись не обнаружена. Можно пройти задание заново."}
                        </p>
                        {task1Answer.url && <audio controls src={task1Answer.url} className="mt-3 w-full" />}
                        <ReferencePanel
                          backendUrl={backendUrl}
                          audioUrl={selectedTest.tasks.task1.referenceAudioUrl}
                          showText={false}
                        />
                        <AiFeedbackBlock feedback={currentTaskFeedback} title="AI-разбор задания 1" />
                      </>
                    )}

                    {currentTask === 2 && (
                      <>
                        <p className="exam-subtle">
                          Записано ответов: {task2AnsweredCount} из {task2QuestionCount}
                        </p>
                        <div className="task2-result-list">
                          {task2Questions.map((question, index) => (
                            <div key={question.id || index} className="task2-result-item">
                              <p className="task2-result-title">
                                Вопрос {index + 1}: {question.text}
                              </p>
                              {question.audioUrl && (
                                <AudioLine
                                  backendUrl={backendUrl}
                                  src={question.audioUrl}
                                  label="Аудио вопроса"
                                />
                              )}
                              {task2Answers[index]?.url ? (
                                <audio controls src={task2Answers[index].url} className="mt-2 w-full" />
                              ) : (
                                <p className="exam-subtle">Ответ не записан</p>
                              )}
                              <ReferencePanel
                                backendUrl={backendUrl}
                                title={`Эталон ответа ${index + 1}`}
                                text={question.referenceText}
                                audioUrl={question.referenceAudioUrl}
                              />
                              <AiFeedbackBlock
                                feedback={currentTaskFeedback?.questions?.[index]}
                                title={`AI-разбор ответа ${index + 1}`}
                              />
                            </div>
                          ))}
                        </div>
                        <AiFeedbackBlock feedback={currentTaskFeedback} title="AI-разбор задания 2" />
                      </>
                    )}

                    {currentTask === 3 && (
                      <>
                        <p className="exam-subtle">
                          {task3Completed
                            ? "Монолог записан. Можно завершать вариант."
                            : "Запись не обнаружена. Можно пройти задание заново."}
                        </p>
                        {task3Answer.url && <audio controls src={task3Answer.url} className="mt-3 w-full" />}
                        <ReferencePanel
                          backendUrl={backendUrl}
                          title="Эталон задания 3"
                          text={selectedTest.tasks.task3.referenceText}
                          audioUrl={selectedTest.tasks.task3.referenceAudioUrl}
                        />
                        <AiFeedbackBlock feedback={currentTaskFeedback} title="AI-разбор задания 3" />
                      </>
                    )}
                  </div>
                )}

                <div className="exam-nav">
                  {currentStage === STAGES.PREP && (
                    <>
                      <button
                        type="button"
                        onClick={handlePrepBack}
                        disabled={isTaskTrainingMode ? selectedTestIndex <= 0 : currentTask === 1}
                        className="btn btn-outline text-sm"
                      >
                        {isTaskTrainingMode ? "Предыдущий номер" : "Назад"}
                      </button>
                      <button type="button" onClick={() => setCurrentStage(STAGES.RECORD)} className="btn btn-primary text-sm">
                        Перейти к записи
                      </button>
                    </>
                  )}

                  {currentStage === STAGES.RECORD && (
                    <>
                      <button type="button" onClick={handleRecordBack} className="btn btn-outline text-sm">
                        Назад
                      </button>
                      <button
                        type="button"
                        onClick={handleRecordNext}
                        className="btn btn-primary text-sm"
                      >
                        {currentTask === 2 && activeQuestionIndex < task2QuestionCount - 1
                          ? "Следующий вопрос"
                          : "Завершить этап"}
                      </button>
                    </>
                  )}

                  {currentStage === STAGES.TASK_RESULT && (
                    <>
                      <button type="button" onClick={restartCurrentTask} className="btn btn-outline text-sm">
                        Пройти заново это задание
                      </button>
                      {canUseAi && (
                        <button
                          type="button"
                          onClick={() => runAiEvaluation({ onlyTask: currentTask })}
                          disabled={aiEvaluating}
                          className="btn btn-outline text-sm"
                        >
                          {aiEvaluating ? "AI проверяет..." : "Проверить это задание AI"}
                        </button>
                      )}
                      {isTaskTrainingMode && (
                        <button
                          type="button"
                          onClick={() => moveTaskTrainingVariant(1)}
                          disabled={selectedTestIndex >= tests.length - 1}
                          className="btn btn-outline text-sm"
                        >
                          Следующий номер
                        </button>
                      )}
                      <button type="button" onClick={handleTaskResultContinue} className="btn btn-primary text-sm">
                        {isTaskTrainingMode
                          ? "Повторить это задание"
                          : currentTask < 3
                            ? "К следующему заданию"
                            : "К итогам варианта"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            )}

            {currentStage === STAGES.FINAL_RESULT && (
              <article className="exam-result-card">
                <h2 className="exam-title">Вариант завершен</h2>
                <p className="exam-description">
                  {aiFeedback
                    ? "AI-проверка выполнена. Ниже детальный фидбек по всему варианту."
                    : "Итог пока рассчитан только по факту прохождения. Запустите AI-проверку, чтобы получить разбор."}
                </p>

                {aiEvaluating && (
                  <p className="status-warning rounded-xl p-3 text-sm">
                    {aiProgress || "AI анализирует ваши ответы..."}
                  </p>
                )}

                {!canUseAi && (
                  <p className="status-warning mt-3 rounded-xl p-3 text-sm">
                    AI-проверка доступна только после входа в PRO-аккаунт.
                    {!user && (
                      <Link href="/login" className="ml-2 font-semibold underline">
                        Войти
                      </Link>
                    )}
                  </p>
                )}

                {canUseAi && hasRecordedAnswers && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={runAiEvaluation}
                      disabled={aiEvaluating}
                      className="btn btn-primary"
                    >
                      {aiEvaluating
                        ? "AI проверяет..."
                        : aiFeedback
                          ? "Перепроверить вариант AI"
                          : "Проверить вариант AI"}
                    </button>
                  </div>
                )}

                <div className="final-score-grid">
                  <div className="final-score-item">
                    <span>Задание 1</span>
                    <strong>{displayedScores.task1.toFixed(1)}</strong>
                  </div>
                  <div className="final-score-item">
                    <span>Задание 2</span>
                    <strong>{displayedScores.task2.toFixed(1)}</strong>
                  </div>
                  <div className="final-score-item">
                    <span>Задание 3</span>
                    <strong>{displayedScores.task3.toFixed(1)}</strong>
                  </div>
                  <div className="final-score-item total">
                    <span>{aiFeedback ? "AI общий балл" : "Общий балл"}</span>
                    <strong>{displayedOverallScore.toFixed(1)}</strong>
                  </div>
                </div>

                {aiFeedback && (
                  <div className="task-result-box mt-4">
                    <p className="question-card-label">AI-разбор</p>
                    <div className="task2-result-list">
                      {[1, 2, 3].map((taskNo) => {
                        const key = `task${taskNo}`;
                        const taskData = aiFeedback[key];
                        return (
                          <div key={key} className="task2-result-item">
                            <p className="task2-result-title">
                              Задание {taskNo}: {roundOne(taskData?.score || 0).toFixed(1)} / 5
                            </p>
                            {taskData?.recommendations?.length > 0 ? (
                              <p className="exam-subtle">
                                Рекомендации: {taskData.recommendations.join("; ")}
                              </p>
                            ) : (
                              <p className="exam-subtle">Рекомендаций пока нет.</p>
                            )}
                            {taskData?.errors?.length > 0 && (
                              <p className="exam-subtle mt-1">
                                Частые ошибки: {taskData.errors.join("; ")}
                              </p>
                            )}
                            {taskData?.improvedAnswer && (
                              <p className="exam-subtle mt-1">
                                Улучшенный ответ: {taskData.improvedAnswer}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {(aiFeedback.globalRecommendations?.length > 0 ||
                      aiFeedback.globalErrors?.length > 0) && (
                      <div className="mt-3">
                        {aiFeedback.globalRecommendations?.length > 0 && (
                          <p className="exam-subtle">
                            Общие рекомендации: {aiFeedback.globalRecommendations.join("; ")}
                          </p>
                        )}
                        {aiFeedback.globalErrors?.length > 0 && (
                          <p className="exam-subtle mt-1">
                            Общие ошибки: {aiFeedback.globalErrors.join("; ")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="exam-nav">
                  <button type="button" onClick={startNewVariant} className="btn btn-outline">
                    Пройти вариант снова
                  </button>
                  <button
                    type="button"
                    onClick={saveAttempt}
                    disabled={!user || savingAttempt}
                    className="btn btn-primary"
                  >
                    {savingAttempt ? "Сохраняем..." : "Сохранить попытку в профиль"}
                  </button>
                </div>

                {!user && (
                  <p className="status-warning mt-4 rounded-xl p-3 text-sm">
                    Чтобы сохранить результат в профиль, войдите в аккаунт.
                    <Link href="/login" className="ml-2 font-semibold underline">
                      Войти
                    </Link>
                  </p>
                )}
              </article>
            )}
          </div>
        </section>

        {error && <p className="status-error mt-4 rounded-xl p-3 text-sm">{error}</p>}
        {info && <p className="status-success mt-4 rounded-xl p-3 text-sm">{info}</p>}
      </div>
    </main>
  );
}





