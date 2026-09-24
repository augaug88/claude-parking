const SLA_URL = "https://www.sla.gov.sg/";
const LICENCE_URL = "https://data.gov.sg/open-data-licence";

export default function Footer() {
  const date = new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Singapore" });
  const link = "underline decoration-outline underline-offset-2 hover:text-on-surface";
  return (
    <footer className="shrink-0 border-t border-outline/60 bg-surface px-3 py-1.5 text-[10px] leading-snug text-on-surface-variant">
      Contains information from LTA DataMall Carpark Availability accessed on {date} from the Land Transport Authority (LTA
      DataMall), and map data from OneMap © contributors | Singapore Land Authority{" "}
      <a className={link} href={SLA_URL} target="_blank" rel="noopener noreferrer">
        {SLA_URL}
      </a>
      , both made available under the terms of the Singapore Open Data Licence version 1.0{" "}
      <a className={link} href={LICENCE_URL} target="_blank" rel="noopener noreferrer">
        {LICENCE_URL}
      </a>
      . This is an SMU course project and is not affiliated with or endorsed by the Land Transport Authority or the Singapore
      Land Authority.
    </footer>
  );
}
