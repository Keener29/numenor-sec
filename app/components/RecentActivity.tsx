interface Alert {
  id: number;
  alertType: string;
  subject: string;
  threatLevel: string;
  createdAt: string;
}

interface RecentActivityProps {
  alerts: Alert[];
}

export default function RecentActivity({ alerts }: RecentActivityProps) {
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
    <div className="mt-8 bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Recent Activity
        </h3>
        <div className="space-y-3">
          {alerts.length > 0 ? alerts.slice(0, 5).map((alert) => {
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
  );
}
