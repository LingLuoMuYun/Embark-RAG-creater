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

  return response.json();
}

export async function fetchRagDetail(id: string) {
  const response = await fetch(`/api/knowledge-bases/${id}`, {
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

  return response.json();
}

export async function fetchDocumentChunks(params: {
  knowledgeBaseId: string;
  documentId: string;
}) {
  const response = await fetch(
    `/api/knowledge-bases/${params.knowledgeBaseId}/documents/${params.documentId}/chunks`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch document chunks: ${response.status}`);
  }

  return response.json();
}
