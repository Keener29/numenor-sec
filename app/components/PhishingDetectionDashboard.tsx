import { useState, useEffect } from "react";
import PhishingPrevention from "./PhishingPrevention";

interface ThreatStatistics {
  summary: {
    totalAlerts: number;
    criticalAlerts: number;
    highAlerts: number;
    mediumAlerts: number;
    lowAlerts: number;
    pendingAlerts: number;
    safeAlerts: number;
  };
  threatBreakdown: Array<{
    threat_level: string;
    count: number;
    date: string;
  }>;
  recentAlerts: Array<{
    id: number;
    threat_level: string;
    status: string;
    created_at: string;
    email_address: string;
    subject: string;
    sender_email: string;
  }>;
  monitoring: {
    emails: {
      total_emails: number;
      connected_emails: number;
      disconnected_emails: number;
    };
    scans: {
      total_scans: number;
      successful_scans: number;
      failed_scans: number;
    };
  };
}

interface MonitoringStatus {
  isMonitoring: boolean;
  interval: number;
}

export default function PhishingDetectionDashboard({ setIsModalOpen }: { readonly setIsModalOpen: (isModalOpen: boolean) => void }) {
  const [statistics, setStatistics] = useState<ThreatStatistics | null>(null);
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<'overview' | 'prevention' | 'monitoring'>('overview');

  useEffect(() => {
    loadDashboardData();
    // Listen for external updates (e.g., when an alert is marked safe)
    const onStatsUpdated = () => {
      loadDashboardData();
    };
    if (globalThis.window !== undefined) {
      globalThis.window.addEventListener('phishing:statsUpdated', onStatsUpdated);
    }
    return () => {
      if (globalThis.window !== undefined) {
        globalThis.window.removeEventListener('phishing:statsUpdated', onStatsUpdated);
      }
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      setError("");

      const [statsResponse, statusResponse] = await Promise.all([
        fetch(`${process.env.VITE_API_URL}/phishing/statistics`, {
          credentials: 'include'
        }),
        fetch(`${process.env.VITE_API_URL}/phishing/monitoring/status`, {
          credentials: 'include'
        })
      ]);

      if (!statsResponse.ok || !statusResponse.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const statsData = await statsResponse.json();
      const statusData = await statusResponse.json();

      console.log("statsData: " + statsData);

      setStatistics(statsData.statistics || {
        summary: {
          totalAlerts: 0,
          criticalAlerts: 0,
          highAlerts: 0,
          mediumAlerts: 0,
          pendingAlerts: 0
        },
        threatBreakdown: [],
        recentAlerts: [],
        monitoring: {
          emails: {
            total_emails: 0,
            connected_emails: 0,
            disconnected_emails: 0
          },
          scans: {
            total_scans: 0,
            successful_scans: 0,
            failed_scans: 0
          }
        }
      });
      setMonitoringStatus(statusData.monitoring?.status || { isMonitoring: false, interval: 30000 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      console.error("Error loading dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getThreatLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'safe': return 'bg-green-100 text-green-800';
      case 'reviewed': return 'bg-blue-100 text-blue-800';
      case 'threat': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
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
            <h2 className="text-2xl font-bold text-gray-900">🛡️ Phishing Detection Dashboard</h2>
            <p className="mt-1 text-sm text-gray-500">
              Advanced threat detection and prevention system
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              monitoringStatus?.isMonitoring 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {monitoringStatus?.isMonitoring ? '🟢 Monitoring Active' : '🔴 Monitoring Inactive'}
            </div>
            <button
              onClick={loadDashboardData}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview', icon: '📊' },
              { id: 'prevention', name: 'Prevention', icon: '🛡️' },
              { id: 'monitoring', name: 'Monitoring', icon: '👁️' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                        <span className="text-white text-sm font-medium">🚨</span>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Total Alerts
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {statistics?.summary?.totalAlerts || 0}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                        <span className="text-white text-sm font-medium">🔥</span>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Critical/High
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {(statistics?.summary?.criticalAlerts || 0) + (statistics?.summary?.highAlerts || 0)}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                        <span className="text-white text-sm font-medium">⚠️</span>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Pending
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {statistics?.summary?.pendingAlerts || 0}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

            </div>

          {/* Recent Alerts */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Recent Phishing Alerts
              </h3>
              {statistics && statistics.recentAlerts.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Subject
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sender
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Threat Level
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Detected
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {statistics.recentAlerts.map((alert) => (
                        <tr key={alert.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {alert.email_address}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                            {alert.subject}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {alert.sender_email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getThreatLevelColor(alert.threat_level)}`}>
                              {alert.threat_level.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(alert.status)}`}>
                              {alert.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(alert.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🛡️</div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">No Phishing Alerts Yet</h4>
                  <p className="text-gray-500 mb-4">
                    Great! No phishing threats have been detected. This could mean:
                  </p>
                  <ul className="text-sm text-gray-600 text-left max-w-md mx-auto space-y-2">
                    <li className="flex items-start">
                      <span className="text-green-500 mr-2">✓</span>
                      <span>Your email security is working well</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">ℹ️</span>
                      <span>You haven't added email addresses for monitoring yet</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">ℹ️</span>
                      <span>The monitoring service is still being set up</span>
                    </li>
                  </ul>
                  <div className="mt-6">
                    <button
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        setIsModalOpen(true);
                      }}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 cursor-pointer"
                    >
                      Add Email Monitoring
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'prevention' && (
        <PhishingPrevention />
      )}

      {activeTab === 'monitoring' && (
        <div className="space-y-6">
          {/* Monitoring Status */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Email Monitoring Status
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Service Status</h4>
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    monitoringStatus?.isMonitoring ? 'bg-green-400' : 'bg-red-400'
                  }`}></div>
                  <span className="text-sm text-gray-900">
                    {monitoringStatus?.isMonitoring ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Scan interval: {monitoringStatus?.interval ? `${monitoringStatus.interval / 1000}s` : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Monitoring Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h4 className="text-md font-medium text-gray-900 mb-4">📧 Email Monitoring</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Emails</span>
                    <span className="text-sm font-medium text-blue-600">{statistics?.monitoring?.emails?.total_emails || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Connected</span>
                    <span className="text-sm font-medium text-green-600">{statistics?.monitoring?.emails?.connected_emails || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Disconnected</span>
                    <span className="text-sm font-medium text-red-600">{statistics?.monitoring?.emails?.disconnected_emails || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h4 className="text-md font-medium text-gray-900 mb-4">🔍 Scan Statistics</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Scans (24h)</span>
                    <span className="text-sm font-medium">{statistics?.monitoring?.scans?.total_scans || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Successful</span>
                    <span className="text-sm font-medium text-green-600">{statistics?.monitoring?.scans?.successful_scans || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Failed</span>
                    <span className="text-sm font-medium text-red-600">{statistics?.monitoring?.scans?.failed_scans || 0}</span>
                  </div>
                </div>
              </div>
            </div>
        </div>
      )}
    </div>
  );
}
