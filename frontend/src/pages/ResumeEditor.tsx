import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Download, ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, MessageSquare, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { ChatPanel } from '../components/ChatPanel';
import { useResumeStore } from '../stores/resumeStore';
import type { ResumeData } from '../services/api';
import { resumeApi } from '../services/api';

export function ResumeEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentResume, loading, fetchResume, updateResume } = useResumeStore();
  const [data, setData] = useState<ResumeData | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    personal_info: true, education: true, work_experience: true,
    projects: true, leadership: false, skills: true, languages: true,
  });

  useEffect(() => {
    if (id) fetchResume(id);
  }, [id]);

  useEffect(() => {
    if (currentResume) {
      setData(currentResume.data);
      setName(currentResume.name);
    }
  }, [currentResume]);

  const toggleSection = (section: string) => {
    setExpandedSections((s) => ({ ...s, [section]: !s[section] }));
  };

  const handleSave = async () => {
    if (!id || !data) return;
    setSaving(true);
    await updateResume(id, { name, data });
    setSaving(false);
  };

  const handleExport = async () => {
    if (!id) return;
    const { data: result } = await resumeApi.exportLatex(id);
    const blob = new Blob([result.latex_source], { type: 'application/x-tex' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !data) {
    return <p className="text-gray-400 text-center py-12">Loading...</p>;
  }

  const updateField = (path: string, value: any) => {
    setData((prev) => {
      if (!prev) return prev;
      const clone = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = clone;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return clone;
    });
  };

  const addItem = (section: string, template: any) => {
    setData((prev) => {
      if (!prev) return prev;
      const clone = JSON.parse(JSON.stringify(prev));
      (clone as any)[section] = [{ ...template, id: crypto.randomUUID() }, ...(clone as any)[section]];
      return clone;
    });
  };

  const removeItem = (section: string, index: number) => {
    setData((prev) => {
      if (!prev) return prev;
      const clone = JSON.parse(JSON.stringify(prev));
      (clone as any)[section].splice(index, 1);
      return clone;
    });
  };

  const moveItem = (section: string, index: number, direction: 'up' | 'down') => {
    setData((prev) => {
      if (!prev) return prev;
      const clone = JSON.parse(JSON.stringify(prev));
      const arr = (clone as any)[section];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= arr.length) return prev;
      [arr[index], arr[targetIndex]] = [arr[targetIndex], arr[index]];
      return clone;
    });
  };

  const SectionHeader = ({ title, section }: { title: string; section: string }) => (
    <button
      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      onClick={() => toggleSection(section)}
    >
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {expandedSections[section] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
    </button>
  );

  const handleChatUpdate = () => {
    // Re-fetch resume data after chat modifies it
    if (id) fetchResume(id);
  };

  return (
    <div className="flex gap-4">
      {/* Main editor column */}
      <div className={`space-y-4 ${showChat ? 'flex-1 min-w-0' : 'w-full'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/resumes')}>
            <ArrowLeft size={16} />
          </Button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={showChat ? 'primary' : 'secondary'}
            onClick={() => setShowChat(!showChat)}
          >
            <MessageSquare size={16} className="mr-2" />
            AI Chat
          </Button>
          <Button variant="secondary" onClick={handleExport}>
            <Download size={16} className="mr-2" />
            Export LaTeX
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} className="mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Personal Info */}
      <Card>
        <SectionHeader title="Personal Information" section="personal_info" />
        {expandedSections.personal_info && (
          <CardContent className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={data.personal_info.first_name} onChange={(e) => updateField('personal_info.first_name', e.target.value)} />
            <Input label="Last Name" value={data.personal_info.last_name} onChange={(e) => updateField('personal_info.last_name', e.target.value)} />
            <Input label="Email" value={data.personal_info.email} onChange={(e) => updateField('personal_info.email', e.target.value)} />
            <Input label="Phone" value={data.personal_info.phone} onChange={(e) => updateField('personal_info.phone', e.target.value)} />
            <Input label="Address" value={data.personal_info.address} onChange={(e) => updateField('personal_info.address', e.target.value)} className="col-span-2" />
            <Input label="LinkedIn" value={data.personal_info.linkedin} onChange={(e) => updateField('personal_info.linkedin', e.target.value)} />
            <Input label="GitHub" value={data.personal_info.github} onChange={(e) => updateField('personal_info.github', e.target.value)} />
          </CardContent>
        )}
      </Card>

      {/* Education */}
      <Card>
        <SectionHeader title="Education" section="education" />
        {expandedSections.education && (
          <CardContent className="space-y-4">
            {data.education.map((edu, idx) => (
              <div key={edu.id || idx} className="border border-gray-100 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                    <button onClick={() => moveItem('education', idx, 'up')} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20" title="Move up"><ArrowUpCircle size={16} /></button>
                    <button onClick={() => moveItem('education', idx, 'down')} disabled={idx === data.education.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20" title="Move down"><ArrowDownCircle size={16} /></button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeItem('education', idx)}>
                    <Trash2 size={14} className="text-red-400" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Dates" value={edu.dates} onChange={(e) => updateField(`education.${idx}.dates`, e.target.value)} />
                  <Input label="Degree" value={edu.degree} onChange={(e) => updateField(`education.${idx}.degree`, e.target.value)} />
                  <Input label="Track" value={edu.track} onChange={(e) => updateField(`education.${idx}.track`, e.target.value)} />
                  <Input label="School" value={edu.school} onChange={(e) => updateField(`education.${idx}.school`, e.target.value)} />
                  <Input label="Location" value={edu.location} onChange={(e) => updateField(`education.${idx}.location`, e.target.value)} />
                  <Input label="Grade/GPA" value={edu.grade} onChange={(e) => updateField(`education.${idx}.grade`, e.target.value)} />
                </div>
                <Textarea label="Courses (comma-separated)" value={edu.courses.join(', ')} onChange={(e) => updateField(`education.${idx}.courses`, e.target.value.split(',').map((c: string) => c.trim()).filter(Boolean))} rows={2} />
                <Input label="Thesis" value={edu.thesis || ''} onChange={(e) => updateField(`education.${idx}.thesis`, e.target.value || null)} />
                <Textarea label="Honors (one per line)" value={edu.honors.join('\n')} onChange={(e) => updateField(`education.${idx}.honors`, e.target.value.split('\n').filter(Boolean))} rows={2} />
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => addItem('education', { dates: '', degree: '', track: '', school: '', location: '', grade: '', courses: [], thesis: null, honors: [] })}>
              <Plus size={14} className="mr-1" /> Add Education
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Work Experience */}
      <Card>
        <SectionHeader title="Work Experience" section="work_experience" />
        {expandedSections.work_experience && (
          <CardContent className="space-y-4">
            {data.work_experience.map((work, idx) => (
              <div key={work.id || idx} className="border border-gray-100 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                    <button onClick={() => moveItem('work_experience', idx, 'up')} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20" title="Move up"><ArrowUpCircle size={16} /></button>
                    <button onClick={() => moveItem('work_experience', idx, 'down')} disabled={idx === data.work_experience.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20" title="Move down"><ArrowDownCircle size={16} /></button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeItem('work_experience', idx)}>
                    <Trash2 size={14} className="text-red-400" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Dates" value={work.dates} onChange={(e) => updateField(`work_experience.${idx}.dates`, e.target.value)} />
                  <Input label="Title" value={work.title} onChange={(e) => updateField(`work_experience.${idx}.title`, e.target.value)} />
                  <Input label="Company" value={work.company} onChange={(e) => updateField(`work_experience.${idx}.company`, e.target.value)} />
                  <Input label="Location" value={work.location} onChange={(e) => updateField(`work_experience.${idx}.location`, e.target.value)} />
                </div>
                <Textarea label="Description" value={work.description} onChange={(e) => updateField(`work_experience.${idx}.description`, e.target.value)} rows={3} />
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => addItem('work_experience', { dates: '', title: '', company: '', location: '', description: '' })}>
              <Plus size={14} className="mr-1" /> Add Work Experience
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Projects */}
      <Card>
        <SectionHeader title="Projects" section="projects" />
        {expandedSections.projects && (
          <CardContent className="space-y-4">
            {data.projects.map((proj, idx) => (
              <div key={proj.id || idx} className="border border-gray-100 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                    <button onClick={() => moveItem('projects', idx, 'up')} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20" title="Move up"><ArrowUpCircle size={16} /></button>
                    <button onClick={() => moveItem('projects', idx, 'down')} disabled={idx === data.projects.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20" title="Move down"><ArrowDownCircle size={16} /></button>
                    {proj.tags.map((tag) => (
                      <Badge key={tag} variant="info">{tag}</Badge>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeItem('projects', idx)}>
                    <Trash2 size={14} className="text-red-400" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Dates" value={proj.dates} onChange={(e) => updateField(`projects.${idx}.dates`, e.target.value)} />
                  <Input label="Title" value={proj.title} onChange={(e) => updateField(`projects.${idx}.title`, e.target.value)} />
                  <Input label="Context" value={proj.context} onChange={(e) => updateField(`projects.${idx}.context`, e.target.value)} className="col-span-2" />
                </div>
                <Textarea label="Description" value={proj.description} onChange={(e) => updateField(`projects.${idx}.description`, e.target.value)} rows={4} />
                <Input label="Tags (comma-separated)" value={proj.tags.join(', ')} onChange={(e) => updateField(`projects.${idx}.tags`, e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean))} />
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => addItem('projects', { dates: '', title: '', context: '', description: '', tags: [] })}>
              <Plus size={14} className="mr-1" /> Add Project
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Leadership */}
      <Card>
        <SectionHeader title="Leadership & Student Work" section="leadership" />
        {expandedSections.leadership && (
          <CardContent className="space-y-4">
            {data.leadership.map((lead, idx) => (
              <div key={lead.id || idx} className="border border-gray-100 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-500">#{idx + 1}</span>
                    <button onClick={() => moveItem('leadership', idx, 'up')} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20" title="Move up"><ArrowUpCircle size={16} /></button>
                    <button onClick={() => moveItem('leadership', idx, 'down')} disabled={idx === data.leadership.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20" title="Move down"><ArrowDownCircle size={16} /></button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeItem('leadership', idx)}>
                    <Trash2 size={14} className="text-red-400" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Dates" value={lead.dates} onChange={(e) => updateField(`leadership.${idx}.dates`, e.target.value)} />
                  <Input label="Title" value={lead.title} onChange={(e) => updateField(`leadership.${idx}.title`, e.target.value)} />
                  <Input label="Organization" value={lead.organization} onChange={(e) => updateField(`leadership.${idx}.organization`, e.target.value)} />
                  <Input label="Parent Org" value={lead.parent_org} onChange={(e) => updateField(`leadership.${idx}.parent_org`, e.target.value)} />
                </div>
                <Textarea label="Description" value={lead.description} onChange={(e) => updateField(`leadership.${idx}.description`, e.target.value)} rows={3} />
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => addItem('leadership', { dates: '', title: '', organization: '', parent_org: '', description: '' })}>
              <Plus size={14} className="mr-1" /> Add Leadership
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Skills */}
      <Card>
        <SectionHeader title="Technical Skills" section="skills" />
        {expandedSections.skills && (
          <CardContent className="space-y-3">
            {Object.entries(data.skills).map(([category, content]) => (
              <div key={category} className="flex gap-3 items-start">
                <Input
                  value={category}
                  className="w-40 flex-shrink-0"
                  onChange={(e) => {
                    const newSkills = { ...data.skills };
                    delete newSkills[category];
                    newSkills[e.target.value] = content;
                    updateField('skills', newSkills);
                  }}
                />
                <Textarea value={content} rows={1} onChange={(e) => updateField(`skills.${category}`, e.target.value)} className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => {
                  const newSkills = { ...data.skills };
                  delete newSkills[category];
                  setData((prev) => prev ? { ...prev, skills: newSkills } : prev);
                }}>
                  <Trash2 size={14} className="text-red-400" />
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => {
              const newSkills = { ...data.skills, 'New Category': '' };
              setData((prev) => prev ? { ...prev, skills: newSkills } : prev);
            }}>
              <Plus size={14} className="mr-1" /> Add Skill Category
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Languages */}
      <Card>
        <SectionHeader title="Languages" section="languages" />
        {expandedSections.languages && (
          <CardContent className="space-y-3">
            {data.languages.map((lang, idx) => (
              <div key={idx} className="flex gap-3 items-start">
                <Input label={idx === 0 ? 'Language' : undefined} value={lang.language} onChange={(e) => updateField(`languages.${idx}.language`, e.target.value)} className="flex-1" />
                <Input label={idx === 0 ? 'Level' : undefined} value={lang.level} onChange={(e) => updateField(`languages.${idx}.level`, e.target.value)} className="flex-1" />
                <Input label={idx === 0 ? 'Detail' : undefined} value={lang.detail} onChange={(e) => updateField(`languages.${idx}.detail`, e.target.value)} className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => removeItem('languages', idx)} className={idx === 0 ? 'mt-6' : ''}>
                  <Trash2 size={14} className="text-red-400" />
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => addItem('languages', { language: '', level: '', detail: '' })}>
              <Plus size={14} className="mr-1" /> Add Language
            </Button>
          </CardContent>
        )}
      </Card>
      </div>

      {/* Chat panel */}
      {showChat && id && (
        <div className="w-96 flex-shrink-0 sticky top-0 h-[calc(100vh-3rem)]">
          <ChatPanel resumeId={id} onResumeUpdated={handleChatUpdate} />
        </div>
      )}
    </div>
  );
}
