import {useEffect, useState} from 'react';

import Menu from '../menu/menu';

import logo from './logo.svg';

import type {Weather} from './weather';

import styles from './header.module.css';

interface Props {
  isBlur: boolean;
}

export function Header(props: Props) {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    fetch(
      `https://weather.googleapis.com/v1/currentConditions:lookup?key=${apiKey}&units_system=METRIC&location.latitude=25.2048&location.longitude=55.2708`
    )
      .then(res => {
        if (!res.ok) {
          throw new Error('Network response was not ok');
        }
        return res.json();
      })
      .then(data => {
        setWeather(data);
      })
      .catch(error => {
        console.error(
          'There has been a problem with your fetch operation:',
          error
        );
      });
  }, []);

  return (
    <header className={styles.header}>
      <img src={logo} className={styles.logo} alt="Google Maps Platform" />
      <div className={styles.locationWeather}>
        <div>
          <span>Dubai ·&nbsp;</span>
          <span className={styles.region}>UAE</span>
        </div>
        <div className={styles.pipe}></div>

        <div className={styles.weather}>
          {weather && (
            <>
              <img
                src={weather.weatherCondition.iconBaseUri + '.svg'}
                width={28}
                height={28}
                alt=""
              />
              {weather.weatherCondition.description.text} ·{' '}
              {weather.temperature.degrees}°C
            </>
          )}
        </div>
      </div>
      <Menu isBlur={props.isBlur} />
    </header>
  );
}
