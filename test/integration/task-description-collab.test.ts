import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  createTaskDescriptionStore,
  decodeDocState,
  encodeDocState,
} from "../../src/server/realtime/task-docs";

describe("task description collaboration", () => {
  it("converges concurrent edits through the shared task document store", () => {
    const store = createTaskDescriptionStore();
    const projectId = "project_docs";
    const taskId = "task_readme";

    const initialState = store.getDocumentState(projectId, taskId, "Release demo");

    const aliceDoc = new Y.Doc();
    const bobDoc = new Y.Doc();
    Y.applyUpdate(aliceDoc, decodeDocState(initialState));
    Y.applyUpdate(bobDoc, decodeDocState(initialState));

    aliceDoc.transact(() => {
      aliceDoc.getText("description").insert(0, "Realtime ");
    }, "alice");
    bobDoc.transact(() => {
      bobDoc.getText("description").insert(bobDoc.getText("description").length, " today");
    }, "bob");

    store.applyClientUpdate(
      projectId,
      taskId,
      encodeDocState(Y.encodeStateAsUpdate(aliceDoc)),
      "Release demo",
    );
    store.applyClientUpdate(
      projectId,
      taskId,
      encodeDocState(Y.encodeStateAsUpdate(bobDoc)),
      "Release demo",
    );

    const mergedState = store.getDocumentState(projectId, taskId, "Release demo");
    const mergedDoc = new Y.Doc();
    Y.applyUpdate(mergedDoc, decodeDocState(mergedState));

    expect(mergedDoc.getText("description").toString()).toBe("Realtime Release demo today");
  });
});
