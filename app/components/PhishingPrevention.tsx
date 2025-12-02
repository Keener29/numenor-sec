import { useState, useEffect } from "react";

interface SecurityRecommendation {
  uuid: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
  category: string;
}

interface ThreatSummary {
  totalThreats: number;
  threatLevels: Record<string, number>;
  topPatterns: Array<{ uuid: string; pattern: string; count: number }>;
}

interface PhishingPreventionProps {
  readonly businessId?: number;
}

export default function PhishingPrevention({ businessId }: PhishingPreventionProps) {
  const [recommendations, setRecommendations] = useState<SecurityRecommendation[]>([]);
  const [threatSummary, setThreatSummary] = useState<ThreatSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, [businessId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError("");

      const [recommendationsResponse, statisticsResponse] = await Promise.all([
        fetch(`${process.env.VITE_API_URL}/phishing/recommendations`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${process.env.VITE_API_URL}/phishing/statistics`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        })
      ]);

      if (!recommendationsResponse.ok) {
        throw new Error('Failed to load security recommendations');
      }

      if (!statisticsResponse.ok) {
        throw new Error('Failed to load threat statistics');
      }

      const recommendationsData = await recommendationsResponse.json();
      const statisticsData = await statisticsResponse.json();
      recommendationsData.recommendations = recommendationsData.recommendations.map((recommendation: SecurityRecommendation) => ({ ...recommendation, uuid: crypto.randomUUID() }));

      setRecommendations(recommendationsData.recommendations || []);

      const stats = statisticsData.statistics?.summary || {};
      const recentAlerts = statisticsData.statistics?.recentAlerts || [];
      
      const patternCounts = recentAlerts.reduce((acc: Record<string, number>, alert: { alert_type?: string }) => {
        const alertType = alert.alert_type || 'unknown';
        acc[alertType] = (acc[alertType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topPatterns = Object.entries(patternCounts)
        .map(([pattern, count]) => ({ uuid: crypto.randomUUID(), pattern, count: count as number }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setThreatSummary({
        totalThreats: stats.totalAlerts || 0,
        threatLevels: {
          critical: stats.criticalAlerts || 0,
          high: stats.highAlerts || 0,
          medium: stats.mediumAlerts || 0,
          low: 0
        },
        topPatterns
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      console.error("Error loading data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'critical': return '🔥';
      case 'high': return '🚨';
      case 'medium': return '⚠️';
      case 'low': return 'ℹ️';
      default: return '📋';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'immediate_action': return '⚡';
      case 'security_enhancement': return '🛡️';
      case 'bec_protection': return '👔';
      case 'attachment_security': return '📎';
      case 'user_education': return '🎓';
      case 'email_authentication': return '🔐';
      default: return '📋';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              🛡️ Phishing Prevention & Security Recommendations
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Proactive security measures to protect your business from phishing attacks
            </p>
          </div>
          <button
            onClick={loadData}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Threat Summary */}
      {threatSummary && (
        <div className="bg-white shadow rounded-lg p-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">📊 Threat Summary (Last 30 Days)</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{threatSummary.totalThreats}</div>
              <div className="text-sm text-gray-500">Total Threats</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {(threatSummary.threatLevels.critical || 0) + (threatSummary.threatLevels.high || 0)}
              </div>
              <div className="text-sm text-red-500">High/Critical Threats</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{threatSummary.threatLevels.medium || 0}</div>
              <div className="text-sm text-yellow-500">Medium Threats</div>
            </div>
          </div>
          
          {threatSummary.topPatterns.length > 0 && (
            <div className="mt-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Top Threat Patterns:</h5>
              <div className="flex flex-wrap gap-2">
                {threatSummary.topPatterns.map((pattern) => (
                  <span
                    key={pattern.uuid}
                    className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800"
                  >
                    {pattern.pattern.replaceAll('_', ' ')} ({pattern.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security Recommendations */}
      <div className="bg-white shadow rounded-lg p-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">🎯 Security Recommendations</h4>
        
        {recommendations.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">✅</div>
            <h5 className="text-lg font-medium text-gray-900 mb-2">Great Job!</h5>
            <p className="text-gray-500">No immediate security recommendations at this time.</p>
            <p className="text-sm text-gray-400 mt-2">Keep monitoring your email security regularly.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recommendations.map((recommendation) => (
              <div
                key={recommendation.uuid}
                className={`border rounded-lg p-4 ${getPriorityColor(recommendation.priority)}`}
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0 mr-3">
                    <span className="text-2xl">
                      {getPriorityIcon(recommendation.priority)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium">
                        {getCategoryIcon(recommendation.category)} {recommendation.title}
                      </h5>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(recommendation.priority)}`}>
                        {recommendation.priority.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm opacity-90">
                      {recommendation.description}
                    </p>
                    <div className="mt-2 p-2 bg-white bg-opacity-50 rounded border">
                      <p className="text-sm font-medium">Recommended Action:</p>
                      <p className="text-sm">{recommendation.action}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prevention Tips */}
      <div className="bg-white shadow rounded-lg p-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">💡 General Prevention Tips</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h5 className="font-medium text-gray-700">For Your Team:</h5>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Never click links in suspicious emails</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Verify sender identity before responding</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Be cautious of urgent requests</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                <span>Report suspicious emails immediately</span>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <h5 className="font-medium text-gray-700">For Your Business:</h5>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">🔧</span>
                <span>Implement email authentication (SPF, DKIM, DMARC)</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">🔧</span>
                <span>Use multi-factor authentication</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">🔧</span>
                <span>Regular security training sessions</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">🔧</span>
                <span>Keep software and systems updated</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
}
