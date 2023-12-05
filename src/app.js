import AppRoutes          from './routes';
import { BrowserRouter }  from 'react-router-dom';
import './scss/app.scss';

function App() {
	return (
		<div className="App">
			<header className="App-header">
				<BrowserRouter basename='/ms/app'>
					<AppRoutes />
				</BrowserRouter>
			</header>
		</div>
	);
}

export default App;
