// Synthetic mock of the observed v0.2 presentation contract. Never imported by production code.
export function officialResponse() {
  return {
    ok: true,
    data: {
      status: 'insufficient-evidence',
      message: 'FlowCredit 初步风险评估\n\n已识别（用户提供）：\n- 业务类型：AI 推理\n- GPU：H100（等效类别）\n- GPU 使用量：4,200 小时\n- 收入：100,000 美元\n- 算力支出：58,000 美元\n- 历史还款率：96%\n- 30 天以上逾期率：2%\n- 付费客户：168\n- Top 5 客户收入占比：36%\n\n基于当前已提供、尚未充分核验的数据，可计算的局部维度：\n- 偿付表现：94.3\n- 客户结构：89.9\n\n以上为局部计算值，不代表完整风险评级。\n完整 TAI / CCI / Risk Grade：暂不可计算\n当前信息或证据不足以形成完整风险评级，需要补充数据或证据。\nFlowCredit 不会自行补全或编造缺失数据。\n仅供风险评估参考，不构成授信批准、投资建议或法定审计意见。',
      presentation: {
        title: 'FlowCredit 初步风险评估', assessmentStatus: 'limited', decisionStatus: 'insufficient-evidence', evidenceStrength: 'low',
        summary: '当前信息或证据不足以形成完整风险评级，需要补充数据或证据。',
        availableScores: { repayment: 94.3, customer: 89.9 },
        nextSteps: ['补充：评估主体和评估周期', '补充：Token 使用量和有效率（输入 Token、输出 Token 和有效率）', '补充：历史经营、数据覆盖和交叉验证信息（最近数月经营历史）', '为已提供数据补充来源证据']
      },
      extractedDraft: { taskType: 'inference', gpuModel: 'h100-equivalent', gpuHours: 4200, revenueUsd: 100000, computeSpendUsd: 58000, repaymentRatePct: 96, overdue30Pct: 2, payingCustomers: 168, top5ConcentrationPct: 36 },
      readinessStatus: 'limited', decisionStatus: 'insufficient-evidence', evidenceStrength: 'low',
      missingInputs: ['label', 'periodStart', 'periodEnd', 'modelTier', 'inputTokensM', 'outputTokensM', 'validRatePct', 'monthlySeries', 'operatingHistoryDays', 'dataCoveragePct', 'R', 'C'],
      requiredActions: [
        { priority: 1, category: 'missing-data', fields: ['inputTokensM', 'outputTokensM', 'validRatePct'], message: 'Complete token activity inputs.' },
        { priority: 2, category: 'missing-data', fields: ['label', 'periodStart', 'periodEnd'], message: 'Complete scope inputs.' },
        { priority: 3, category: 'evidence', fields: ['revenueUsd', 'repaymentRatePct'], message: 'Add field-level evidence for supplied decision fields.' }
      ]
    }
  };
}
