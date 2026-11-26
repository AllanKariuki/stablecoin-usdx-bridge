import Hero from './landing/Hero';
import Facts from './landing/Facts';
import HowItWorks from './landing/HowItWorks';
import Reserves from './landing/Reserves';
import Bento from './landing/Bento';
import Rules from './landing/Rules';
import Audiences from './landing/Audiences';
import Faq from './landing/Faq';
import { Cta, Footer } from './landing/Cta';

/**
 * The anonymous front door, composed from one file per section under
 * ./landing. There's no password form here, by design: both buttons hand off
 * to Keycloak's hosted pages (themed to match).
 */
export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col gap-3.5 bg-shell p-3 sm:p-4">
      <Hero />
      <Facts />
      <HowItWorks />
      <Reserves />
      <Bento />
      <Rules />
      <Audiences />
      <Faq />
      <Cta />
      <Footer />
    </div>
  );
}
