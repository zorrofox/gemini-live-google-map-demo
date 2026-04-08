import styles from "./place-ratings.module.css";

const numberFormatter = new Intl.NumberFormat();

interface Props {
  rating: number | null | undefined;
  userRatingCount: number | null | undefined;
}

export function PlaceRatings(props: Props) {
  const { rating, userRatingCount } = props;

  const getStars = (starsRating: number | null | undefined) => {
    if (starsRating == null || starsRating === undefined) {
      return null;
    }

    const elements = [];

    const quantizedStars = Math.round(starsRating * 2) / 2;
    const fullStars = Math.floor(quantizedStars);
    const halfStar = quantizedStars % 1 !== 0;

    for (let i = 0; i < 5; i++) {
      let icon;
      if (i < fullStars) {
        icon = "star";
      } else if (i === fullStars && halfStar) {
        icon = "star_half";
      } else {
        icon = "star_border";
      }

      elements.push(
        <span className={`material-icons ${styles.starIcon}`} key={i}>
          {icon}
        </span>,
      );
    }

    return elements;
  };

  return (
    <div className={styles.placeRatings}>
      <div className={styles.starsContainer}>
        <span className={styles.starsText}>{rating?.toFixed(1)}</span>
        {getStars(rating)}
        {userRatingCount ? (
          <span className={styles.infoboxReviews}>
            ({numberFormatter.format(userRatingCount ?? 0)})
          </span>
        ) : null}
      </div>
    </div>
  );
}
