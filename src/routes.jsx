/* eslint no-unused-vars : "off" */

import React                          from 'react';
import { Route, Switch, useLocation } from "react-router-dom";
import Log                            from 'common/log';
import Landing                        from 'containers/landing';
import SelectDevice                   from 'containers/select-device';
import Room                           from 'containers/room';

const log = new Log ('routes', 'debug');

function AppRoutes () {
    log.debug ('current route =', useLocation().pathname)

	return (
		<Switch>
			<Route exact path='/'                component={Landing} />
			<Route exact path='/room/'           component={Room} />
			<Route exact path='/room/:roomId'    component={Room} />
			<Route exact path='/room/:roomId/sd' component={SelectDevice} />
		</Switch>
	);
}

export default AppRoutes ;
