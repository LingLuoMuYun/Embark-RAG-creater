async function readApiData<T>(response: Response): Promise<T> {
  const payload = await response.json();

  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    "data" in payload
  ) {
    return payload.data as T;
  }

  return payload as T;
}

export async function fetchRagItems() {
  const response = await fetch("/api/knowledge-bases", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch knowledge bases: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function createKnowledgeBase(payload: unknown) {
  const response = await fetch("/api/knowledge-bases", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create knowledge base: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function fetchRagDetail(id: string) {
  const response = await fetch(`/api/knowledge-bases/${id}/tree`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch knowledge base detail: ${response.status}`
    );
  }

  return readApiData<unknown>(response);
}

export async function updateKnowledgeBase(id: string, payload: unknown) {
  const response = await fetch(`/api/knowledge-bases/${id}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update knowledge base: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function deleteKnowledgeBase(id: string) {
  const response = await fetch(`/api/knowledge-bases/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete knowledge base: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function createKnowledgeDocument(payload: unknown) {
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to create document: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function deleteKnowledgeDocument(id: string) {
  const response = await fetch(`/api/documents/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete document: ${response.status}`);
  }

  return readApiData<unknown>(response);
}

export async function fetchDocumentChunks(params: { documentId: string }) {
  const response = await fetch(`/api/documents/${params.documentId}/chunks`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch document chunks: ${response.status}`);
  }

  return readApiData<unknown>(response);
}
