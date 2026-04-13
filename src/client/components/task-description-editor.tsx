"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createTaskDescriptionDocController } from "../collab/task-description-doc";

type TaskDescriptionEditorProps = {
  canEdit: boolean;
  clientId: string;
  onBlur: () => void;
  onFocus: () => void;
  onPersist: (value: string) => Promise<void>;
  projectId: string;
  taskId: string;
};

export function TaskDescriptionEditor({
  canEdit,
  clientId,
  onBlur,
  onFocus,
  onPersist,
  projectId,
  taskId,
}: TaskDescriptionEditorProps) {
  const [value, setValue] = useState("");
  const persistedValueRef = useRef("");
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChangeOriginRef = useRef<"local" | "remote">("remote");
  const controller = useMemo(
    () =>
      clientId
        ? createTaskDescriptionDocController({
            clientId,
            projectId,
            taskId,
          })
        : null,
    [clientId, projectId, taskId],
  );

  useEffect(() => {
    if (!controller) {
      return;
    }

    let isActive = true;
    const stopObserving = controller.observe((origin) => {
      if (!isActive) {
        return;
      }

      lastChangeOriginRef.current = origin;
      const nextValue = controller.getValue();
      setValue(nextValue);
    });

    void controller.connect().then(() => {
      if (!isActive) {
        return;
      }

      const nextValue = controller.getValue();
      lastChangeOriginRef.current = "remote";
      setValue(nextValue);
      persistedValueRef.current = nextValue;
    });

    return () => {
      isActive = false;
      stopObserving();
      controller.destroy();
    };
  }, [controller]);

  useEffect(() => {
    if (!controller || !canEdit) {
      return;
    }

    if (lastChangeOriginRef.current === "remote") {
      return;
    }

    if (persistedValueRef.current === value) {
      return;
    }

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      void onPersist(value)
        .then(() => {
          persistedValueRef.current = value;
        })
        .catch(() => undefined);
    }, 1_200);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [canEdit, controller, onPersist, value]);

  return (
    <textarea
      aria-label="Task description"
      className="text-input task-description-input"
      disabled={!canEdit || !controller}
      onBlur={() => {
        onBlur();
        if (persistedValueRef.current !== value) {
          void onPersist(value)
            .then(() => {
              persistedValueRef.current = value;
            })
            .catch(() => undefined);
        }
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        lastChangeOriginRef.current = "local";
        setValue(nextValue);
        controller?.replaceText(nextValue);
      }}
      onFocus={onFocus}
      placeholder="Add a collaborative description"
      rows={3}
      value={value}
    />
  );
}
