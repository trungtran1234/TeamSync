import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SignIn from './forms/SignIn';
import SignUp from './forms/SignUp';
import Dashboard from './Dashboard';  
import MeetingDetails from "./MeetingDetails";
import Settings from "./Settings";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<SignIn />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/meeting/:id" element={<MeetingDetails />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Router>
  );
}

export default App;
