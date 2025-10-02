import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/dashboard";
import { emailsAPI, alertsAPI, authAPI } from "../utils/api";

export function meta({}: Route.MetaArgs) {
  // return metadata for the dashboard
  return [
    { title: "Dashboard - Numenor Security" },
    { name: "description", content: "Monitor your gym's email security" },
  ];
}

// Function to process daily alerts data for the chart
const processChartData = (dailyAlerts: any[]) => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  
  // Create a map of date to count for quick lookup
  const alertsMap = new Map();
  dailyAlerts.forEach(alert => {
    // Convert ISO date to YYYY-MM-DD format for consistent lookup
    const dateString = new Date(alert.date).toISOString().split('T')[0];
    alertsMap.set(dateString, alert.count);
  });
    
  // Generate chart data for the last 7 days
  const chartData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateString = date.toISOString().split('T')[0];
    const dayIndex = date.getDay();
    const dayName = days[dayIndex === 0 ? 6 : dayIndex - 1]; // Adjust for Monday start
    
    const alertCount = alertsMap.get(dateString) || 0;
    console.log(`Date: ${dateString}, Day: ${dayName}, Alerts: ${alertCount}`);
    
    chartData.push({
      day: dayName,
      alerts: alertCount
    });
  }
  
  return chartData;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [emails, setEmails] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      setError("");

      // Load emails, alerts, and stats in parallel
      const [emailsResponse, alertsResponse, emailStats, alertStats] = await Promise.all([
        emailsAPI.getEmails({ limit: 10 }),
        alertsAPI.getAlerts({ limit: 10 }),
        emailsAPI.getEmailStats(),
        alertsAPI.getAlertStats(),
      ]);

      console.log('Emails data:', emailsResponse.emails);
      console.log('Alerts data:', alertsResponse.alerts);
      
      setEmails(emailsResponse.emails || []);
      setAlerts(alertsResponse.alerts || []);
      setStats({
        ...emailStats.stats,
        ...alertStats.stats,
      });

      // Process daily alerts data for the chart
      const dailyAlerts = alertStats.stats?.dailyAlerts || [];
      console.log('Daily alerts data:', dailyAlerts);
      const processedChartData = processChartData(dailyAlerts);
      console.log('Processed chart data:', processedChartData);
      setChartData(processedChartData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      console.error("Dashboard error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkSafe = async (alertId: number) => {
    try {
      await alertsAPI.updateAlert(alertId, { status: "safe" });
      // Reload alerts to get updated data
      const alertsResponse = await alertsAPI.getAlerts({ limit: 10 });
      setAlerts(alertsResponse.alerts || []);
    } catch (err) {
      console.error("Failed to mark alert as safe:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      // Still navigate to login even if logout API fails
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Numenor Security</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleLogout}
                className="text-gray-700 px-3 py-2 rounded-md text-base font-medium bg-white border-0 cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-8xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Monitor your gym's email security and phishing protection status
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="mx-4 mb-8 flex justify-center">
            <div className="text-gray-500">Loading dashboard data...</div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm font-medium">📧</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Connected Emails
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.connectedEmails || 0}
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
                  <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm font-medium">⚠️</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Alerts This Week
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.totalAlerts || 0}
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
                  <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                    <span className="text-white text-sm font-medium">✅</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Protection Status
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.connectedEmails > 0 ? "Active" : "Inactive"}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Email Monitoring Table */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Email Monitoring
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pending Alerts
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {emails.map((email) => (
                      <tr key={email.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {email.emailAddress}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${email.isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {email.isConnected ? 'Connected' : 'Disconnected'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            {alerts.filter(alert => alert.emailId === email.id && alert.status !== 'safe').length}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleMarkSafe(email.id)}
                            className="bg-white text-blue-600 hover:text-blue-900 px-3 py-1 rounded border-0 hover:bg-blue-50 cursor-pointer"
                          >
                            Mark Safe
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Phishing Alerts (Last 7 Days)
              </h3>
              <div className="h-64 flex justify-between space-x-4 items-end">
                {chartData.length > 0 ? chartData.map((data, index) => {
                  const maxAlerts = Math.max(...chartData.map(d => d.alerts), 1);
                  const height = (data.alerts / maxAlerts) * 200;
                  
                  return (
                    <div key={index} className="flex flex-col items-center flex-1">
                      <div
                        className="bg-blue-500 w-full rounded-t mb-2"
                        style={{ height: `${height}px` }}
                      ></div>
                      <div className="text-xs text-gray-600">{data.day}</div>
                      <div className="text-xs font-medium text-gray-900">{data.alerts}</div>
                    </div>
                  );
                }) : (
                  <div className="flex items-center justify-center w-full h-full text-gray-500">
                    No alert data available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Recent Activity
            </h3>
            <div className="space-y-3">
              {alerts.length > 0 ? alerts.slice(0, 5).map((alert) => {
                const getAlertColor = (threatLevel: string) => {
                  switch (threatLevel) {
                    case 'critical': return 'bg-red-500';
                    case 'high': return 'bg-red-500';
                    case 'medium': return 'bg-yellow-500';
                    case 'low': return 'bg-green-500';
                    default: return 'bg-gray-500';
                  }
                };
                
                const formatDate = (dateString: string) => {
                  const date = new Date(dateString);
                  const now = new Date();
                  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
                  
                  if (diffInHours < 1) return 'Just now';
                  if (diffInHours < 24) return `${diffInHours} hours ago`;
                  const diffInDays = Math.floor(diffInHours / 24);
                  return `${diffInDays} days ago`;
                };
                
                return (
                  <div key={alert.id} className="flex items-center text-sm">
                    <div className="flex-shrink-0">
                      <div className={`w-2 h-2 ${getAlertColor(alert.threatLevel)} rounded-full`}></div>
                    </div>
                    <div className="ml-3">
                      <span className="text-gray-900">
                        {alert.alertType} - {alert.subject}
                      </span>
                      <span className="text-gray-500 ml-2">
                        {formatDate(alert.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              }) : (
                <div className="text-gray-500 text-sm">No recent alerts</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
