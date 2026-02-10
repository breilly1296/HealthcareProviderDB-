import {
  HeroSection,
  TrustBar,
  WhyItMattersSection,
  HowItWorksSection,
  ConfidenceSection,
  CTASection,
} from '@/components/home';

export default function HomePage() {
  return (
    <div>
      <HeroSection />
      <TrustBar />
      <WhyItMattersSection />
      <HowItWorksSection />
      <ConfidenceSection />
      <CTASection />
    </div>
  );
}
