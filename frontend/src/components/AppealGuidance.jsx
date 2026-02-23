import React from 'react';

export default function AppealGuidance({ job }) {
  if (!job.appeal_intelligence) return null;

  return (
    <div className="appeal-section">
      <h3>Appeal Likelihood: {job.appeal_intelligence.likelihood_score}/100</h3>
      <p>Defense Strength: {job.appeal_intelligence.defense_strength}</p>
      <p>Suggested Tone: {job.appeal_intelligence.tone_guidance}</p>
      <h4>Mitigation Arguments</h4>
      <table>
        <thead>
          <tr>
            <th>Argument</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {job.appeal_intelligence.mitigation_arguments?.map((arg, i) => (
            <tr key={i}>
              <td>{arg.argument_text}</td>
              <td>{arg.supporting_evidence?.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
