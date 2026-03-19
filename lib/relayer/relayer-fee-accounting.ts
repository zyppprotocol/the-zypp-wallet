/**
 * Relayer Fee Accounting
 *
 * Tracks and manages fees charged by the Zypp Relayer Network
 * Provides reporting and cost analysis capabilities
 */

import { supabase } from "../supabase";
import { log } from "../utils/logger";

export interface RelayerFeeRecord {
  id: string;
  zyppUserId: string;
  transactionId: string;
  relayerEndpoint: string;
  feeAmount: string; // In lamports
  currency: string;
  status: "pending" | "confirmed" | "failed" | "refunded";
  paymentSignature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RelayerCostSummary {
  id: string;
  zyppUserId: string;
  month: string;
  relayerEndpoint: string;
  totalSubmissions: number;
  successfulSubmissions: number;
  failedSubmissions: number;
  totalFeesPaid: string;
  averageFeePerSubmission: string;
}

/**
 * Record a relayer fee charge
 */
export async function recordRelayerFee(
  zyppUserId: string,
  transactionId: string,
  relayerEndpoint: string,
  feeAmount: string, // In lamports
): Promise<{
  success: boolean;
  feeId?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("relayer_fees")
      .insert([
        {
          zypp_user_id: zyppUserId,
          transaction_id: transactionId,
          relayer_endpoint: relayerEndpoint,
          fee_amount: feeAmount,
          currency: "lamports",
          status: "pending",
        },
      ])
      .select("id")
      .single();

    if (error) {
      log.error("Failed to record relayer fee", error);
      return {
        success: false,
        error: error.message,
      };
    }

    log.info("Relayer fee recorded", {
      feeId: data?.id,
      zyppUserId,
      transactionId,
      relayerEndpoint,
      feeAmount,
    });

    return {
      success: true,
      feeId: data?.id,
    };
  } catch (error) {
    log.error("Error recording relayer fee", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update a relayer fee status
 */
export async function updateRelayerFeeStatus(
  feeId: string,
  status: "pending" | "confirmed" | "failed" | "refunded",
  paymentSignature?: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase
      .from("relayer_fees")
      .update({
        status,
        payment_signature: paymentSignature,
        updated_at: new Date().toISOString(),
      })
      .eq("id", feeId);

    if (error) {
      log.error("Failed to update relayer fee status", error);
      return {
        success: false,
        error: error.message,
      };
    }

    log.info("Relayer fee status updated", {
      feeId,
      status,
      paymentSignature,
    });

    return {
      success: true,
    };
  } catch (error) {
    log.error("Error updating relayer fee status", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get total relayer fees for a user in a given period
 */
export async function getUserRelayerFees(
  zyppUserId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  totalFees: string;
  count: number;
  average: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("relayer_fees")
      .select("fee_amount")
      .eq("zypp_user_id", zyppUserId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    if (error) {
      log.error("Failed to get user relayer fees", error);
      return {
        totalFees: "0",
        count: 0,
        average: "0",
        error: error.message,
      };
    }

    const count = data?.length || 0;
    const totalFees =
      data?.reduce((sum, record) => {
        return sum + BigInt(record.fee_amount || "0");
      }, BigInt(0)) || BigInt(0);

    const average = count > 0 ? (totalFees / BigInt(count)).toString() : "0";

    log.info("User relayer fees retrieved", {
      zyppUserId,
      totalFees: totalFees.toString(),
      count,
      average,
    });

    return {
      totalFees: totalFees.toString(),
      count,
      average,
    };
  } catch (error) {
    log.error("Error getting user relayer fees", error);
    return {
      totalFees: "0",
      count: 0,
      average: "0",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get relayer cost summary for a user for a given month
 */
export async function getRelayerCostSummary(
  zyppUserId: string,
  month: Date,
): Promise<{
  summaries: RelayerCostSummary[];
  error?: string;
}> {
  try {
    // Format month as YYYY-MM for the query
    const monthStr = month.toISOString().split("T")[0].slice(0, 7);

    const { data, error } = await supabase
      .from("relayer_cost_summary")
      .select("*")
      .eq("zypp_user_id", zyppUserId)
      .like("month", `${monthStr}%`);

    if (error) {
      log.error("Failed to get relayer cost summary", error);
      return {
        summaries: [],
        error: error.message,
      };
    }

    const summaries: RelayerCostSummary[] = (data || []).map((record) => ({
      id: record.id,
      zyppUserId: record.zypp_user_id,
      month: record.month,
      relayerEndpoint: record.relayer_endpoint,
      totalSubmissions: record.total_submissions,
      successfulSubmissions: record.successful_submissions,
      failedSubmissions: record.failed_submissions,
      totalFeesPaid: record.total_fees_paid,
      averageFeePerSubmission: record.average_fee_per_submission,
    }));

    log.info("Relayer cost summaries retrieved", {
      zyppUserId,
      month: monthStr,
      count: summaries.length,
    });

    return {
      summaries,
    };
  } catch (error) {
    log.error("Error getting relayer cost summary", error);
    return {
      summaries: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Calculate and record activity for cost summary (typically run monthly)
 */
export async function generateCostSummary(
  zyppUserId: string,
  month: Date,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // This would typically be a database function or trigger
    // For now, we provide a placeholder for manual invocation
    log.info("Generating relayer cost summary", {
      zyppUserId,
      month: month.toISOString(),
    });

    // In production, this would aggregate data from relayer_fees table
    // and create monthly summaries

    return {
      success: true,
    };
  } catch (error) {
    log.error("Error generating cost summary", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get top relayers by fees for a user
 */
export async function getTopRelayersByFees(
  zyppUserId: string,
  limit = 10,
): Promise<{
  relayers: {
    endpoint: string;
    totalFees: string;
    count: number;
    average: string;
  }[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from("relayer_fees")
      .select("relayer_endpoint, fee_amount")
      .eq("zypp_user_id", zyppUserId);

    if (error) {
      log.error("Failed to get top relayers", error);
      return {
        relayers: [],
        error: error.message,
      };
    }

    // Group by relayer and calculate totals
    const relayerMap = new Map<string, { totalFees: bigint; count: number }>();

    for (const record of data || []) {
      const endpoint = record.relayer_endpoint;
      const fee = BigInt(record.fee_amount || "0");

      if (!relayerMap.has(endpoint)) {
        relayerMap.set(endpoint, { totalFees: BigInt(0), count: 0 });
      }

      const current = relayerMap.get(endpoint)!;
      current.totalFees += fee;
      current.count += 1;
    }

    // Convert to array and sort by total fees
    const relayers = Array.from(relayerMap.entries())
      .map(([endpoint, stats]) => ({
        endpoint,
        totalFees: stats.totalFees.toString(),
        count: stats.count,
        average: (stats.totalFees / BigInt(stats.count)).toString(),
      }))
      .sort((a, b) => Number(BigInt(b.totalFees) - BigInt(a.totalFees)))
      .slice(0, limit);

    log.info("Top relayers retrieved", {
      zyppUserId,
      count: relayers.length,
    });

    return {
      relayers,
    };
  } catch (error) {
    log.error("Error getting top relayers", error);
    return {
      relayers: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
