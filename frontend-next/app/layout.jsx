import { AuthProvider } from '../src/components/AuthProvider';
import './globals.css';
export const metadata = {
    title: 'Nagrik Setu',
    description: 'Public grievance redressal portal',
};
export default function RootLayout({ children }) {
    return (<html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>);
}
