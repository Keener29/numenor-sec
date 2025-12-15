interface AzureLoginProps {
    handleOauthLogin: () => void;
    isLoading: boolean;
    text: string;
}

const MicrosoftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
);

export default function AzureLogin({ handleOauthLogin, isLoading, text }: AzureLoginProps) {

  return (
<div className="w-full flex justify-center">
  <button
    onClick={handleOauthLogin}
    disabled={isLoading}
    className="
      h-[40px]
      w-[220px]
      px-4
      flex items-center justify-center gap-2
      font-normal
      rounded-full
      border border-gray-300
      bg-white
      text-sm font-medium text-gray-700
      shadow-sm
      hover:bg-gray-50
      focus:outline-none focus:ring-2 focus:ring-blue-500
      disabled:opacity-50 disabled:cursor-not-allowed
      whitespace-nowrap
      overflow-hidden
    "
  >
    <MicrosoftIcon />
    {text}
  </button>
</div>


  );
}