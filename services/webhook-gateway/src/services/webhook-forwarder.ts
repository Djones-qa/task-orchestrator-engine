const SCHEDULER_API_URL = process.env.SCHEDULER_API_URL || 'http://localhost:5000';

export interface ForwardResult {
  success: boolean;
  statusCode?: number;
  executionId?: string;
  error?: string;
}

/**
 * Forwards a validated webhook payload to the Scheduler API
 * POST /api/v1/workflows/:workflowId/execute
 * Returns 502 if Scheduler API is unavailable.
 */
export async function forwardToScheduler(
  workflowId: string,
  payload: Record<string, unknown>
): Promise<ForwardResult> {
  const url = `${SCHEDULER_API_URL}/api/v1/workflows/${workflowId}/execute`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: payload }),
    });

    if (response.ok) {
      const data = (await response.json()) as { id?: string };
      return {
        success: true,
        statusCode: response.status,
        executionId: data.id,
      };
    }

    return {
      success: false,
      statusCode: response.status,
      error: `Scheduler API returned ${response.status}`,
    };
  } catch (err) {
    return {
      success: false,
      statusCode: 502,
      error: 'Scheduler API unavailable',
    };
  }
}
