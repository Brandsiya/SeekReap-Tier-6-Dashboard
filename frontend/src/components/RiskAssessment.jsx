import React from 'react';

export default function RiskAssessment({ job }) {
  if (!job.risk_assessment) return null;

  const score = job.risk_assessment.overall_risk_score || 0;
  const riskLevel = score < 35 ? 'Low' : score < 70 ? 'Medium' : 'High';

  return (
    <div className="risk-section">
      <h3>Overall Risk: {score}/100</h3>
      <span className={`risk-badge ${riskLevel.toLowerCase()}`}>{riskLevel}</span>
      <ul>
        {job.policy_matches?.map((match, i) => (
          <li key={i}>Policy ID: {match.policy_id}, Confidence: {match.match_confidence}</li>
        ))}
      </ul>
      <h4>Recommended Actions</h4>
      <ol>
        {job.recommended_actions?.map((action, i) => <li key={i}>{action}</li>)}
      </ol>
    </div>
  );
}
