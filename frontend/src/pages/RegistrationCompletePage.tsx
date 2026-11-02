import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

export const RegistrationCompletePage = () => {
  const { user, setProfileComplete } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState('+380')
  const [city, setCity] = useState('Київ')
  const [skills, setSkills] = useState('Координація, логістика, автодопомога')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    // Mark questionnaire as completed in AuthContext & localStorage
    setProfileComplete(true)
    void navigate('/profile', { replace: true })
  }

  return (
    <div className="page-container page-auth">
      <div className="card auth-card">
        <div
          className="badge badge-warning"
          style={{ marginBottom: '1rem', display: 'inline-block' }}
        >
          Обовʼязковий крок
        </div>
        <h1>Завершення реєстрації</h1>
        <p className="page-subtitle">
          Будь ласка, заповніть додаткові дані профілю, щоб отримати повний
          доступ до можливостей платформи.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="reg-name">ПІБ / Назва ініціативи</label>
            <input
              id="reg-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-phone">Номер телефону</label>
            <input
              id="reg-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-city">Місто / Регіон</label>
            <input
              id="reg-city"
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-skills">Навички або напрями діяльності</label>
            <textarea
              id="reg-skills"
              rows={3}
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              className="form-textarea"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            Зберегти анкету та перейти до профілю
          </button>
        </form>
      </div>
    </div>
  )
}

export default RegistrationCompletePage
