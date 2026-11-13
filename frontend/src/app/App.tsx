import { BrowserRouter } from 'react-router-dom'
import { Providers } from '@/app/providers'
import { AppRoutes } from '@/app/router'

export const App = () => (
  <Providers>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </Providers>
)

export default App
