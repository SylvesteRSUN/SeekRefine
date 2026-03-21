import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ResumeList } from './pages/ResumeList';
import { ResumeEditor } from './pages/ResumeEditor';
import { JobList } from './pages/JobList';
import { JobDetail } from './pages/JobDetail';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/resumes" element={<ResumeList />} />
          <Route path="/resumes/:id" element={<ResumeEditor />} />
          <Route path="/jobs" element={<JobList />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
