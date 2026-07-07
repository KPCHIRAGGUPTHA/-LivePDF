import { useState, useCallback } from 'react';

export default function useChat({ token }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async (question) => {
    if (!question.trim() || loading) return;

    const userMessage = { role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    // Add a placeholder assistant message that we'll fill token by token
    const assistantMessage = { role: 'assistant', content: '', pageRefs: [], streaming: true };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const conversationHistory = messages.slice(-10);
      const response = await fetch(`/api/qa/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversationHistory }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // keep incomplete last chunk

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'page_refs') {
              setMessages(prev => {
                if (prev.length === 0) return prev;
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  pageRefs: data.pageRefs,
                };
                return updated;
              });
            }

            if (data.type === 'token') {
              setMessages(prev => {
                if (prev.length === 0) return prev;
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + data.text,
                };
                return updated;
              });
            }

            if (data.type === 'done') {
              setMessages(prev => {
                if (prev.length === 0) return prev;
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  streaming: false,
                };
                return updated;
              });
            }

            if (data.type === 'error') {
              setMessages(prev => {
                if (prev.length === 0) return prev;
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: 'Sorry, something went wrong. Please try again.',
                  streaming: false,
                };
                return updated;
              });
            }
          } catch (e) {
            // Malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        if (prev.length === 0) return prev;
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: 'Connection error. Please try again.',
          streaming: false,
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [messages, token, loading]);

  function clearChat() {
    setMessages([]);
  }

  return { messages, loading, sendMessage, clearChat };
}
